import { Router } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import db from "../db.js";
import { recognizeReceiptImage } from "../vision.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "..", "..", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB，手機照片通常足夠
});

const router = Router();

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
    const { readFileSync } = await import("node:fs");
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
      notes: result.notes ?? null,
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
    res.status(502).json({ error: `辨識失敗: ${err.message}` });
  }
});

function getReceiptWithLines(id) {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id);
  if (!receipt) return null;
  const lines = db.prepare("SELECT * FROM receipt_lines WHERE receipt_id = ? ORDER BY id").all(id);
  return { ...receipt, lines };
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM receipt_lines WHERE receipt_id = r.id) AS line_count
       FROM receipts r ORDER BY r.created_at DESC`
    )
    .all();
  res.json(rows);
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
  const lines = rows.map((r) =>
    [r.date_guess, r.vendor_name, r.store_item_code, r.item_name, r.qty_raw, r.unit, r.unit_price_raw, r.amount_raw, r.notes]
      .map(csvEscape)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=invosnap-export.csv");
  res.send("﻿" + [header, ...lines].join("\n")); // 開頭加BOM，Excel開中文CSV才不會亂碼
});

router.get("/:id", (req, res) => {
  const receipt = getReceiptWithLines(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  res.json(receipt);
});

// 覆核頁修正某一列：指定店內品項代碼、標記已確認
router.patch("/:id/lines/:lineId", (req, res) => {
  const { store_item_code, confirmed } = req.body;
  const result = db
    .prepare(
      `UPDATE receipt_lines SET
         store_item_code = COALESCE(@store_item_code, store_item_code),
         confirmed = COALESCE(@confirmed, confirmed)
       WHERE id = @lineId AND receipt_id = @receiptId`
    )
    .run({
      store_item_code: store_item_code ?? null,
      confirmed: confirmed === undefined ? null : confirmed ? 1 : 0,
      lineId: req.params.lineId,
      receiptId: req.params.id,
    });
  if (result.changes === 0) return res.status(404).json({ error: "找不到這筆明細" });
  res.json(getReceiptWithLines(req.params.id));
});

// 店長按下「確認入帳」：要求每一列都已勾選confirmed，才把整張單據標記為confirmed
router.post("/:id/confirm", (req, res) => {
  const receipt = getReceiptWithLines(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
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

export default router;
