import { Router } from "express";
import multer from "multer";
import { mkdirSync, readFileSync, unlink } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import db from "../db.js";
import { recognizeReceiptImages } from "../vision.js";

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

// 拍照上傳並呼叫Vision API辨識，寫入 pending_review 狀態的單據。
// 支援一次傳多張照片（同一張單據的不同頁），全部照片會在同一次API呼叫裡一起送出。
router.post("/recognize", upload.array("photos", 6), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "缺少照片檔案（field name: photos，可以傳多個）" });
  }

  const images = [];
  for (const file of files) {
    const ext = extname(file.originalname || "").toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || file.mimetype;
    if (!Object.values(MIME_BY_EXT).includes(mimeType)) {
      // multer已經把這批檔案（含格式對的其他頁）存到硬碟了，這裡不建立單據就直接
      // return的話，全部都會變孤兒檔案，先清掉
      for (const f of files) unlink(f.path, () => {});
      return res.status(400).json({ error: `不支援的圖片格式: ${ext || mimeType}（支援 jpg/png/webp）` });
    }
    images.push({ buffer: readFileSync(file.path), mimeType, filename: file.filename });
  }

  try {
    const result = await recognizeReceiptImages(images.map(({ buffer, mimeType }) => ({ buffer, mimeType })));
    const vendorId = guessVendorId(result.vendor_name_guess);

    const insertReceipt = db.prepare(
      `INSERT INTO receipts (vendor_id, vendor_name_guess, photo_filename, captured_at, date_guess, receipt_no_guess, status, raw_ocr_json, total_amount_on_receipt, total_pages_guess, notes)
       VALUES (@vendor_id, @vendor_name_guess, @photo_filename, datetime('now'), @date_guess, @receipt_no_guess, 'pending_review', @raw_ocr_json, @total_amount_on_receipt, @total_pages_guess, @notes)`
    );
    const info = insertReceipt.run({
      vendor_id: vendorId,
      vendor_name_guess: result.vendor_name_guess ?? null,
      photo_filename: images[0].filename, // 向後相容用：只支援單張照片的舊程式碼路徑
      date_guess: result.date_guess ?? null,
      receipt_no_guess: result.receipt_no_guess ?? null,
      raw_ocr_json: JSON.stringify(result),
      total_amount_on_receipt: result.total_amount_on_receipt ?? null,
      total_pages_guess: Number.isInteger(result.total_pages_guess) ? result.total_pages_guess : null,
      notes: JSON.stringify(normalizeNotes(result.notes)),
    });
    const receiptId = info.lastInsertRowid;

    const insertPhoto = db.prepare(
      `INSERT INTO receipt_photos (receipt_id, filename, page_number) VALUES (?, ?, ?)`
    );
    images.forEach((img, idx) => insertPhoto.run(receiptId, img.filename, idx + 1));

    const pageCount = images.length;
    const insertLine = db.prepare(
      `INSERT INTO receipt_lines (receipt_id, vendor_item_code, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, matched_store_item_code_guess, store_item_code, confidence, confirmed, page_number)
       VALUES (@receipt_id, @vendor_item_code, @name_raw, @qty_raw, @unit_raw, @unit_price_raw, @amount_raw, @matched_store_item_code_guess, @store_item_code, @confidence, 0, @page_number)`
    );
    for (const item of result.items || []) {
      const page = Number.isInteger(item.page) && item.page >= 1 && item.page <= pageCount ? item.page : 1;
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
        page_number: page,
      });
    }

    res.status(201).json(getReceiptWithLines(receiptId));
  } catch (err) {
    console.error("辨識失敗:", err);
    // 辨識失敗代表沒有真的建立單據，剛剛multer已經存到硬碟的照片檔案會變成
    // 沒有任何資料庫紀錄指向的孤兒檔案，永遠不會被清掉——這裡失敗時順手刪掉，
    // 避免每次認證/額度/格式錯誤都在uploads/留下垃圾檔案
    for (const file of files) {
      unlink(file.path, () => {}); // 刪不掉也不影響回應使用者的錯誤訊息，忽略即可
    }
    res.status(502).json({ error: err.message });
  }
});

// 一張單據可能有多頁照片；新資料存在receipt_photos表，舊資料（改schema前）
// 只有receipts.photo_filename這個單一欄位，這裡統一組成同一種陣列格式給前端用
function getPhotos(receiptId, fallbackFilename) {
  const rows = db
    .prepare("SELECT id, filename, page_number FROM receipt_photos WHERE receipt_id = ? ORDER BY page_number")
    .all(receiptId);
  if (rows.length > 0) {
    return rows.map((p) => ({ id: p.id, page_number: p.page_number, url: `/uploads/${p.filename}` }));
  }
  if (fallbackFilename) {
    return [{ id: null, page_number: 1, url: `/uploads/${fallbackFilename}` }];
  }
  return [];
}

function getReceiptWithLines(id) {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id);
  if (!receipt) return null;
  const lines = db.prepare("SELECT * FROM receipt_lines WHERE receipt_id = ? ORDER BY id").all(id);
  const photos = getPhotos(id, receipt.photo_filename);
  return {
    ...receipt,
    photo_url: photos[0]?.url ?? null, // 向後相容：舊前端邏輯還在用這個欄位的話不會壞
    photos,
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

  const { name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, store_item_code, page_number } = req.body;
  if (!name_raw) return res.status(400).json({ error: "手動新增的品項需要填品名" });

  const info = db
    .prepare(
      `INSERT INTO receipt_lines (receipt_id, vendor_item_code, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, matched_store_item_code_guess, store_item_code, confidence, confirmed, page_number)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, 'manual', 0, ?)`
    )
    .run(
      req.params.id,
      name_raw,
      qty_raw ?? null,
      unit_raw ?? null,
      unit_price_raw ?? null,
      amount_raw ?? null,
      store_item_code ?? null,
      Number.isInteger(page_number) ? page_number : null
    );
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

// 整筆刪除單據（含明細、照片紀錄、實際照片檔案），用來清掉測試資料或建錯的單據。
// 已確認入帳的單據不能直接刪，要先「重新開放編輯」退回待覆核狀態，避免不小心
// 刪掉已經對過帳的紀錄
router.delete("/:id", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).json({ error: "找不到這筆單據" });
  if (receipt.status === "confirmed") {
    return res.status(409).json({
      error: "已確認入帳的單據不能直接刪除，請先「重新開放編輯」退回待覆核狀態再刪，避免誤刪已對過帳的紀錄。",
      code: "receipt_locked",
    });
  }

  const photoFiles = db.prepare("SELECT filename FROM receipt_photos WHERE receipt_id = ?").all(req.params.id);
  const filenames = photoFiles.length > 0 ? photoFiles.map((p) => p.filename) : [receipt.photo_filename].filter(Boolean);

  db.transaction(() => {
    db.prepare("DELETE FROM receipt_lines WHERE receipt_id = ?").run(req.params.id);
    db.prepare("DELETE FROM receipt_photos WHERE receipt_id = ?").run(req.params.id);
    db.prepare("DELETE FROM receipts WHERE id = ?").run(req.params.id);
  })();

  for (const filename of filenames) {
    unlink(join(UPLOAD_DIR, filename), () => {}); // 刪不掉也不影響回應，忽略即可
  }

  res.status(204).end();
});

export default router;
