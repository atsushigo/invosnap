import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../../lib/vision-prompt.js";

const MODEL = process.env.INVOSNAP_VISION_MODEL || "claude-sonnet-5";

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // 讀取環境變數 ANTHROPIC_API_KEY
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
  if (err?.status === 401 || raw.includes("invalid x-api-key") || raw.includes("authentication_error")) {
    return "API Key 無效或已過期，請確認 backend/.env 裡的 ANTHROPIC_API_KEY 是否正確。";
  }
  if (err?.status === 429 || raw.includes("rate_limit")) {
    return "呼叫太頻繁被限流了，稍等一下再試一次。";
  }
  if (err?.status === 529 || raw.includes("overloaded")) {
    return "Claude API 目前忙線中，稍等一下再試一次。";
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
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBuffer.toString("base64") },
            },
            { type: "text", text: "請辨識這張送貨單，回傳符合schema的JSON。" },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(friendlyVisionError(err));
  }
}
