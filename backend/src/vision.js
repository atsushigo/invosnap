import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../../lib/vision-prompt.js";

const MODEL = process.env.INVOSNAP_VISION_MODEL || "claude-sonnet-5";

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // 讀取環境變數 ANTHROPIC_API_KEY
  return client;
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType 例如 image/jpeg
 * @returns {Promise<object>} 符合 docs/06 schema 的辨識結果
 */
export async function recognizeReceiptImage(imageBuffer, mimeType) {
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
}
