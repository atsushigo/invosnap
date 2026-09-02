/**
 * InvoSnap — 送貨單拍照辨識驗證腳本（骨架，尚未執行過）
 *
 * 用途：讀入一張送貨單照片，呼叫 Claude API 的 vision 功能，
 * 依 docs/06-vision-prompt-schema.md 定義的 schema、並依
 * docs/07-key-modules-feasibility.md 模組一的設計（把店內標準品項清單
 * 帶進 prompt，請模型順便猜測比對），印出結構化 JSON。
 *
 * prompt組裝邏輯共用 lib/vision-prompt.js，backend/src/vision.js 也是用
 * 同一份，避免同一段邏輯寫兩份。
 *
 * 這支腳本本身不花錢；只有實際「執行」且用真的 API key 呼叫時才會
 * 依 Anthropic API 用量計費（每張圖片粗估 US$0.01~0.015，見
 * docs/10-vision-api-cost-backup-plan.md）。Claude Max 訂閱額度不含 API 用量。
 *
 * 使用方式：
 *   1. npm install
 *   2. export ANTHROPIC_API_KEY=sk-ant-xxxxx
 *   3. node claude-vision-ocr.js ./sample-receipt.jpg
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { buildSystemPrompt } from "../lib/vision-prompt.js";

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
