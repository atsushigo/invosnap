/**
 * 共用模組：組出送貨單辨識用的 system prompt，內含店內標準品項清單與
 * 生鮮批發業界通用簡稱（見 docs/07、docs/09）。scripts/claude-vision-ocr.js
 * 和 backend/src/vision.js 都從這裡載入，避免同一段prompt邏輯寫兩份。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

export function loadStoreItemCatalog() {
  const items = JSON.parse(readFileSync(join(DATA_DIR, "store-items.json"), "utf8"));
  const aliases = JSON.parse(readFileSync(join(DATA_DIR, "generic-produce-aliases.json"), "utf8"));
  return { items, aliases };
}

export function buildSystemPrompt() {
  const { items, aliases } = loadStoreItemCatalog();
  const catalogLines = items.map((i) => `- ${i.code}: ${i.name}（${i.category}，標準單位:${i.standard_unit}）`);
  const aliasLines = aliases.map((a) => `- 「${a.alias}」→ ${a.store_item_code}`);

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

notes 欄位請拆成多個獨立要點，每個要點是一句完整的話，講清楚「發現了什麼問題／
哪一項／為什麼要特別注意」，方便店長一眼掃過就知道要重點檢查哪裡，不要寫成一長串
用逗號黏在一起的段落。沒有特別要提醒的事項就給空陣列 []，不要硬湊內容。

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
  "notes": ["string", "..."]
}`;
}
