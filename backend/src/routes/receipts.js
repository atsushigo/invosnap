import { Router } from "express";
import multer from "multer";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import db from "../db.js";
import { recognizeReceiptImage } from "../vision.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(__dirname, "..", "..", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// 用diskStorage保留副檔名，這樣 /uploads 靜態伺服時瀏覽器才能正確判斷Content-Type，
// 覆核頁才能把原始照片直接嵌進<img>預覽（見docs/07模組三的延伸需求）
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB，手機照片通常足夠
});

const router = Router();

// 模型輸出的notes可能是陣列（新schema）、單一字串、或null，統一轉成乾淨的
// 字串陣列再存進DB（存成JSON字串），方便前端條列顯示（見docs要求）
function normalizeNotes(notes) {
  if (!notes) return [];
  const list = Array.isArray(notes) ? notes : [notes];
  return list.map((n) => String(n).trim()).filter(Boolean);
}

// 讀取時把notes欄位還原成陣列給前端用：新資料本來就存JSON陣列字串，
// 舊資料（改schema前存的）是一整段字串，退而求其次用中文句號切開條列
function parseNotesForResponse(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 不是JSON，走舊資料的fallback
  }
  return String(raw)
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith("。") ? s : s + "。"));
}

function guessVendorId(vendorNameGuess) {
  if (!vendorNameGuess) return null;
  const row = db
    .prepare("SELECT id FROM vendors WHERE ? LIKE '%' || name || '%' OR name LIKE '%' || ? || '%'")
    .get(vendorNameGuess, vendorNameGuess);
  return row ? row.id : null;
}

// 拍照上傳並呼叫Vision API辨識，寫入 pending_review 狀態的單據
router.post("/recognize", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "缺少照片檔案（field name: photo）" });
  }
  const ext = extname(req.file.originalname || "").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || req.file.mimetype;
  if (!Object.values(MIME_BY_EXT).includes(mimeType)) {
    return res.status(400).json({ error: `不支援的圖片格式: ${ext || mimeType}（支援 jpg/png/webp）` });
  }

  try {
    const imageBuffer = readFileSync(req.file.path);
    const result = await recognizeReceiptImage(imageBuffer, mimeType);
    const vendorId = guessVendorId(result.vendor_name_guess);

    const insertReceipt = db.prepare(
      `INSERT INTO receipts (vendor_id, vendor_name_guess, photo_filename, captured_at, date_guess, receipt_no_guess, status, raw_ocr_json, total_amount_on_receipt, notes)
       VALUES (@vendor_id, @vendor_name_guess, @photo_filename, datetime('now'), @date_guess, @receipt_no_guess, 'pending_review', @raw_ocr_json, @total_amount_on_receipt, @notes)`
    );
    const info = insertReceipt.run({
      vendor_id: vendorId,
      vendor_name_guess: result.vendor_name_guess ?? null,
      photo_filename: req.file.filename,
      date_guess: result.date_guess ?? null,
      receipt_no_guess: result.receipt_no_guess ?? null,
      raw_ocr_json: JSON.stringify(result),
      total_amount_on_receipt: result.total_amount_on_receipt ?? null,
      notes: JSON.stringify(normalizeNotes(result.notes)),
    });
    const receiptId = info.lastInsertRowid;

    const insertLine = db.prepare(
      `INSERT INTO receipt_lines (receipt_id, vendor_item_code, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, matched_store_item_code_guess, store_item_code, confidence, confirmed)
       VALUES (@receipt_id, @vendor_item_code, @name_raw, @qty_raw, @unit_raw, @unit_price_raw, @amount_raw, @matched_store_item_code_guess, @store_item_code, @confidence, 0)`
    );
    for (const item of result.items || []) {
      insertLine.run({
        receipt_id: receiptId,
        vendor_item_code: item.vendor_item_code ?? null,
        name_raw: item.name_raw,
        qty_raw: item.qty_raw ?? null,
        unit_raw: item.unit_raw ?? null,
        unit_price_raw: item.unit_price_raw ?? null,
        amount_raw: item.amount_raw ?? null,
        matched_store_item_code_guess: item.matched_store_item_code_guess ?? null,
        store_item_code: item.matched_store_item_code_guess ?? null, // 先預填猜測值，店長覆核時可修改
        confidence: item.confidence ?? "low",
      });
    }

    res.status(201).json(getReceiptWithLines(receiptId));
  } catch (err) {
    console.error("辨識失敗:", err);
    res.status(502).json({ error: err.message });
  }
});

function getReceiptWithLines(id) {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id);
  if (!receipt) return null;
  const lines = db.prepare("SELECT * FROM receipt_lines WHERE receipt_id = ? ORDER BY id").all(id);
  return {
    ...receipt,
    photo_url: receipt.photo_filename ? `/uploads/${receipt.photo_filename}` : null,
    notes: parseNotesForResponse(receipt.notes),
    lines,
  };
}

function assertEditable(receipt, res) {
  if (receipt.status === "confirmed") {
    res.status(409).json({
      error: "這筆單據已經確認入帳，不能直接修改。要修正的話，請先呼叫「重新開放編輯」把狀態退回待覆核，改完再重新確認一次。",
      code: "receipt_locked",
    });
    return false;
  }
  return true;
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM receipt_lines WHERE receipt_id = r.id) AS line_count
       FROM receipts r ORDER BY r.created_at DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      ...r,
      photo_url: r.photo_filename ? `/uploads/${r.photo_filename}` : null,
      notes: parseNotesForResponse(r.notes),
    }))
  );
});

// 匯出內部標準格式CSV（見 docs/07 模組四），只匯出已confirmed的單據
router.get("/export/csv", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.date_guess, v.name AS vendor_name, rl.store_item_code,
              COALESCE(s.name, rl.name_raw) AS item_name,
              rl.qty_raw, COALESCE(s.standard_unit, rl.unit_raw) AS unit,
              rl.unit_price_raw, rl.amount_raw, r.notes
       FROM receipts r
       JOIN receipt_lines rl ON rl.receipt_id = r.id
       LEFT JOIN vendors v ON v.id = r.vendor_id
       LEFT JOIN store_items s ON s.code = rl.store_item_code
       WHERE r.status = 'confirmed'
       ORDER BY r.date_guess, v.name`
    )
    .all();

  const header = "日期,供應商,品項代碼,品項名稱,數量,單位,單價,金額,備註";
  const csvEscape = (v) => (v == null ? "" : `"${String(v).replaceAll('"', '""')}"`);
  const lines = rows.map((r) => {
    const notesText = parseNotesForResponse(r.notes).join(" / ");
    return [r.date_guess, r.vendor_name, r.store_item_code, r.item_name, r.qty_raw, r.unit, r.unit_price_raw, r.amount_raw, notesText]
      .map(csvEscape)
      .join(",");
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=invosnap-export.csv");
  res.send("﻿" + [header, ...lines].join("\n")); // 開頭加BOM，Excel開中文CSV才不會亂碼
});

router.get("/:id", (req, res) => {
  const receipt = getReceiptWithLines(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  res.json(receipt);
});

// 覆核頁修正某一列：可改店內品項對應、原始辨識欄位（發現辨識錯誤時直接訂正）、標記已確認
router.patch("/:id/lines/:lineId", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (!assertEditable(receipt, res)) return;

  const { store_item_code, confirmed, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw } = req.body;
  const result = db
    .prepare(
      `UPDATE receipt_lines SET
         store_item_code = COALESCE(@store_item_code, store_item_code),
         confirmed = COALESCE(@confirmed, confirmed),
         name_raw = COALESCE(@name_raw, name_raw),
         qty_raw = COALESCE(@qty_raw, qty_raw),
         unit_raw = COALESCE(@unit_raw, unit_raw),
         unit_price_raw = COALESCE(@unit_price_raw, unit_price_raw),
         amount_raw = COALESCE(@amount_raw, amount_raw)
       WHERE id = @lineId AND receipt_id = @receiptId`
    )
    .run({
      store_item_code: store_item_code ?? null,
      confirmed: confirmed === undefined ? null : confirmed ? 1 : 0,
      name_raw: name_raw ?? null,
      qty_raw: qty_raw ?? null,
      unit_raw: unit_raw ?? null,
      unit_price_raw: unit_price_raw ?? null,
      amount_raw: amount_raw ?? null,
      lineId: req.params.lineId,
      receiptId: req.params.id,
    });
  if (result.changes === 0) return res.status(404).json({ error: "找不到這筆明細" });
  res.json(getReceiptWithLines(req.params.id));
});

// 辨識整列誤判（例如把備註誤看成一個品項）時，直接刪掉這一列
router.delete("/:id/lines/:lineId", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (!assertEditable(receipt, res)) return;

  const result = db
    .prepare("DELETE FROM receipt_lines WHERE id = ? AND receipt_id = ?")
    .run(req.params.lineId, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "找不到這筆明細" });
  res.json(getReceiptWithLines(req.params.id));
});

// 辨識漏掉某個品項時，店長可以手動補一列（例如照片被遮擋、或model漏抓）
router.post("/:id/lines", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (!assertEditable(receipt, res)) return;

  const { name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, store_item_code } = req.body;
  if (!name_raw) return res.status(400).json({ error: "手動新增的品項需要填品名" });

  const info = db
    .prepare(
      `INSERT INTO receipt_lines (receipt_id, vendor_item_code, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, matched_store_item_code_guess, store_item_code, confidence, confirmed)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, 'manual', 0)`
    )
    .run(req.params.id, name_raw, qty_raw ?? null, unit_raw ?? null, unit_price_raw ?? null, amount_raw ?? null, store_item_code ?? null);
  res.status(201).json({ ...getReceiptWithLines(req.params.id), newLineId: info.lastInsertRowid });
});

// 店長按下「確認入帳」：要求每一列都已勾選confirmed，才把整張單據標記為confirmed
router.post("/:id/confirm", (req, res) => {
  const receipt = getReceiptWithLines(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (receipt.status === "confirmed") {
    return res.status(409).json({ error: "這筆單據已經確認過了" });
  }
  const unconfirmed = receipt.lines.filter((l) => !l.confirmed);
  if (unconfirmed.length > 0) {
    return res.status(409).json({
      error: `還有 ${unconfirmed.length} 筆明細尚未確認，無法入帳`,
      unconfirmed_line_ids: unconfirmed.map((l) => l.id),
    });
  }
  db.prepare("UPDATE receipts SET status = 'confirmed' WHERE id = ?").run(req.params.id);
  res.json(getReceiptWithLines(req.params.id));
});

// 已確認入帳的單據事後發現有錯，退回待覆核狀態才能繼續編輯，修正流程：
// 確認入帳(誤) → 重新開放編輯 → 修正明細 → 重新確認入帳
router.post("/:id/reopen", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (receipt.status !== "confirmed") {
    return res.status(409).json({ error: "只有已確認入帳的單據才需要重新開放編輯" });
  }
  db.prepare("UPDATE receipts SET status = 'pending_review' WHERE id = ?").run(req.params.id);
  res.json(getReceiptWithLines(req.params.id));
});

export default router;
