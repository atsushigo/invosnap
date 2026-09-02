/**
 * InvoSnap — 送貨單拍照辨識驗證腳本（骨架，尚未執行過）
 *
 * 用途：讀入一張送貨單照片，呼叫 Claude API 的 vision 功能，
 * 依 docs/06-vision-prompt-schema.md 定義的 schema、並依
 * docs/07-key-modules-feasibility.md 模組一的設計（把店內標準品項清單
 * 帶進 prompt，請模型順便猜測比對），印出結構化 JSON。
 *
 * 這支腳本本身不花錢；只有實際「執行」且用真的 API key 呼叫時才會
 * 依 Anthropic API 用量計費（每張圖片粗估 US$0.01~0.015，見
 * docs/05-cost-and-oss-reference.md）。Claude Max 訂閱額度不含 API 用量。
 *
 * 使用方式：
 *   1. npm install
 *   2. export ANTHROPIC_API_KEY=sk-ant-xxxxx
 *   3. node claude-vision-ocr.js ./sample-receipt.jpg
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function loadStoreItemCatalog() {
  const items = JSON.parse(readFileSync(join(DATA_DIR, "store-items.json"), "utf8"));
  const aliases = JSON.parse(readFileSync(join(DATA_DIR, "generic-produce-aliases.json"), "utf8"));
  const catalogLines = items.map((i) => `- ${i.code}: ${i.name}（${i.category}，標準單位:${i.standard_unit}）`);
  const aliasLines = aliases.map((a) => `- 「${a.alias}」→ ${a.store_item_code}`);
  return { catalogLines, aliasLines };
}

function buildSystemPrompt() {
  const { catalogLines, aliasLines } = loadStoreItemCatalog();
  return `你是一個食材送貨單辨識助手。請仔細觀察這張送貨單照片，
盡量原樣抄錄單據上寫的文字與數字，不要自行換算單位、不要自行修正看起來「合理」的數字。
若某個欄位因為印章遮蓋、字跡模糊而無法確定，仍要填入你最可能的判讀，但將該欄位的
confidence 標為 low，絕對不要留空或用猜測值冒充高信心結果。

若單據上該品項印有廠商自己的品項編號（如 B0002、D0007-1 這種格式），請填入
vendor_item_code；沒有的話填 null，不要自己編造一個。

下面是店內目前已知的標準品項清單，請針對每一列辨識出的品項，嘗試猜測它最可能對應到
清單中的哪一項，填入 matched_store_item_code_guess；如果都不像、可能是新品項，
填 null 並在 notes 註記。這個猜測只是輔助，最終仍由人工覆核確認，猜錯不影響辨識本身的
confidence 分數。

【店內標準品項清單】
${catalogLines.join("\n")}

【生鮮批發業界通用簡稱參考（不同供應商常見的通用叫法）】
${aliasLines.join("\n")}

輸出必須嚴格符合下方 JSON schema，不要加入任何額外文字說明，只回傳 JSON 本身。

{
  "vendor_name_guess": "string",
  "receipt_no_guess": "string | null",
  "date_guess": "string | null (YYYY-MM-DD)",
  "items": [
    {
      "vendor_item_code": "string | null",
      "name_raw": "string",
      "qty_raw": "string",
      "unit_raw": "string",
      "unit_price_raw": "string | null",
      "amount_raw": "string | null",
      "matched_store_item_code_guess": "string | null",
      "confidence": "high | medium | low"
    }
  ],
  "total_amount_on_receipt": "string | null",
  "notes": "string | null"
}`;
}

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function recognizeReceipt(imagePath) {
  const ext = extname(imagePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(`不支援的圖片格式: ${ext}（支援 jpg/png/webp）`);
  }

  const imageBase64 = readFileSync(imagePath).toString("base64");
  const client = new Anthropic(); // 讀取環境變數 ANTHROPIC_API_KEY

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 },
          },
          { type: "text", text: "請辨識這張送貨單，回傳符合schema的JSON。" },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return JSON.parse(textBlock.text);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("用法: node claude-vision-ocr.js <圖片路徑>");
  process.exit(1);
}

recognizeReceipt(imagePath)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((err) => {
    console.error("辨識失敗:", err.message);
    process.exit(1);
  });
