import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { buildSystemPrompt } from "../../lib/vision-prompt.js";

const MODEL = process.env.INVOSNAP_VISION_MODEL || "claude-sonnet-5";

// Claude Vision的計費/理解上限約1568px長邊（超過會被自動縮小），手機拍照動輒
// 4000px以上、好幾MB，直接送原圖除了浪費頻寬，超大檔案也可能導致API行為異常
// （實測時遇過一張6.5MB多頁疊拍的照片，模型回傳空白內容而非JSON）。
// 這裡統一在送出前resize+重新編碼成JPEG，長邊不超過1600px。
const MAX_EDGE_PX = 1600;

let client = null;
function getClient() {
  if (!client) {
    // 「身分連動」型的API key（在console.anthropic.com新版介面建立的key）
    // 需要額外帶 anthropic-workspace-id header，否則會回400
    // invalid_request_error: anthropic-workspace-id is required
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return client;
}

/** 供前端在使用者按下辨識前就先提醒，而不是讓他們白等一次才發現沒設定key */
export function isVisionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** 把SDK/API的原始錯誤訊息轉成店長看得懂、知道下一步該做什麼的訊息 */
function friendlyVisionError(err) {
  const raw = err?.message || String(err);
  if (raw.includes("Could not resolve authentication method") || raw.includes("apiKey")) {
    return "還沒設定 Anthropic API Key，無法辨識。請依 backend/README.md 的說明，在 backend/.env 填入 ANTHROPIC_API_KEY 後重新啟動後端（見 docs/10-vision-api-cost-backup-plan.md 了解費用）。";
  }
  if (raw.includes("anthropic-workspace-id")) {
    return "這組是「身分連動」型API key，還需要在 backend/.env 多填一行 ANTHROPIC_WORKSPACE_ID（去 console.anthropic.com 的 Workspace 設定頁找），設定好重啟後端即可，詳見 backend/README.md。";
  }
  if (raw.includes("credit balance is too low")) {
    return "Anthropic帳號額度不足，請到 console.anthropic.com → Settings → Billing 加卡儲值後再試一次（本案用量很小，US$5就能用很久，見 docs/10-vision-api-cost-backup-plan.md）。";
  }
  if (err?.status === 401 || raw.includes("invalid x-api-key") || raw.includes("authentication_error")) {
    return "API Key 無效或已過期，請確認 backend/.env 裡的 ANTHROPIC_API_KEY 是否正確。";
  }
  if (err?.status === 429 || raw.includes("rate_limit")) {
    return "呼叫太頻繁被限流了，稍等一下再試一次。";
  }
  if (err?.status === 529 || raw.includes("overloaded")) {
    return "Claude API 目前忙線中，稍等一下再試一次。";
  }
  if (raw.includes("output truncated")) {
    return "單據品項太多，模型輸出被截斷了，這張單據可能需要分開拍多張照片，或聯絡開發者調高輸出上限。";
  }
  if (raw.includes("Unexpected token") || raw.includes("JSON")) {
    return "模型回傳的內容不是預期的JSON格式，可能是照片太模糊或角度太特殊，換一張照片再試試看。";
  }
  return `辨識失敗：${raw}`;
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType 例如 image/jpeg
 * @returns {Promise<object>} 符合 docs/06 schema 的辨識結果
 */
export async function recognizeReceiptImage(imageBuffer, mimeType) {
  if (!isVisionConfigured()) {
    throw new Error(friendlyVisionError({ message: "Could not resolve authentication method" }));
  }

  try {
    const resized = await sharp(imageBuffer)
      .rotate() // 依照片EXIF方向自動轉正，避免手機直拍變橫的
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8192, // 多品項/多頁單據的JSON可能很長，實測過4096仍會被截斷（見docs/08疊拍多頁的案例）
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: resized.toString("base64") },
            },
            { type: "text", text: "請辨識這張送貨單，回傳符合schema的JSON。" },
          ],
        },
      ],
    });

    if (response.stop_reason === "max_tokens") {
      console.error("模型輸出被max_tokens截斷，單據品項可能太多");
    }

    const textBlock = response.content.find((block) => block.type === "text");
    return parseModelJson(textBlock?.text ?? "", response.stop_reason);
  } catch (err) {
    throw new Error(friendlyVisionError(err));
  }
}

/**
 * 模型即使被要求「只回傳JSON」，實務上仍常常包一層 ```json ... ``` 的 markdown code fence，
 * 或前後夾雜幾句話。這裡做寬鬆解析：先試著直接parse，不行就剝掉code fence，
 * 再不行就抓文字裡第一個 { 到最後一個 } 之間的區段試試看。
 */
function parseModelJson(text, stopReason) {
  const attempts = [
    text,
    text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, ""),
  ];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // 換下一個候選字串再試
    }
  }

  console.error(`模型回傳內容無法解析成JSON（stop_reason=${stopReason}），原始內容長度=${text.length}：\n`, text);
  if (stopReason === "max_tokens") {
    throw new Error("output truncated by max_tokens");
  }
  throw new Error("JSON parse failed after fallback attempts");
}
