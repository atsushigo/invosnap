import { Router } from "express";
import db from "../db.js";

const router = Router();

// 依現有店內主檔的既有慣例，用分類決定品項代碼的字母開頭（見 docs/09），
// 新分類（不在這個表裡的）退而求其次用 X 開頭，維持「代碼看得出大概分類」的可讀性
const CATEGORY_PREFIX = {
  葉菜類: "V",
  "根莖/瓜果類": "R",
  菇類: "M",
  豆製品: "D",
  "加工肉品/丸類": "P",
  "主食/澱粉類": "S",
  "配料/其他": "P",
};

function nextStoreItemCode(category) {
  const prefix = CATEGORY_PREFIX[category] || "X";
  const rows = db.prepare("SELECT code FROM store_items WHERE code LIKE ?").all(`${prefix}%`);
  const maxN = rows.reduce((max, r) => {
    const n = parseInt(r.code.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(3, "0")}`;
}

function nextVendorId() {
  const rows = db.prepare("SELECT id FROM vendors WHERE id LIKE 'VEN%'").all();
  const maxN = rows.reduce((max, r) => {
    const n = parseInt(r.id.slice(3), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `VEN${String(maxN + 1).padStart(3, "0")}`;
}

// ---------- 店內主檔 ----------

router.get("/store-items", (req, res) => {
  res.json(db.prepare("SELECT * FROM store_items ORDER BY category, code").all());
});

router.post("/store-items", (req, res) => {
  const { name, category, standard_unit } = req.body;
  if (!name || !standard_unit) {
    return res.status(400).json({ error: "品項名稱、標準單位為必填" });
  }
  const code = nextStoreItemCode(category);
  db.prepare("INSERT INTO store_items (code, name, category, standard_unit) VALUES (?, ?, ?, ?)").run(
    code,
    name,
    category || null,
    standard_unit
  );
  res.status(201).json(db.prepare("SELECT * FROM store_items WHERE code = ?").get(code));
});

router.patch("/store-items/:code", (req, res) => {
  const { name, category, standard_unit } = req.body;
  const result = db
    .prepare(
      `UPDATE store_items SET
         name = COALESCE(@name, name),
         category = COALESCE(@category, category),
         standard_unit = COALESCE(@standard_unit, standard_unit)
       WHERE code = @code`
    )
    .run({ name: name ?? null, category: category ?? null, standard_unit: standard_unit ?? null, code: req.params.code });
  if (result.changes === 0) return res.status(404).json({ error: "找不到這個品項" });
  res.json(db.prepare("SELECT * FROM store_items WHERE code = ?").get(req.params.code));
});

router.delete("/store-items/:code", (req, res) => {
  const code = req.params.code;
  const usedByMapping = db.prepare("SELECT COUNT(*) AS n FROM vendor_item_mappings WHERE store_item_code = ?").get(code).n;
  const usedByLine = db.prepare("SELECT COUNT(*) AS n FROM receipt_lines WHERE store_item_code = ?").get(code).n;
  if (usedByMapping > 0 || usedByLine > 0) {
    return res.status(409).json({
      error: `這個品項還被 ${usedByMapping} 筆廠商對照、${usedByLine} 筆單據明細使用中，不能刪除。要移除的話，先把這些對照/明細改指到別的品項。`,
    });
  }
  const result = db.prepare("DELETE FROM store_items WHERE code = ?").run(code);
  if (result.changes === 0) return res.status(404).json({ error: "找不到這個品項" });
  res.status(204).end();
});

// ---------- 廠商基本資料 ----------

router.get("/vendors", (req, res) => {
  res.json(db.prepare("SELECT * FROM vendors ORDER BY name").all());
});

router.post("/vendors", (req, res) => {
  const { name, type, unit_habit, document_style, has_vendor_item_code } = req.body;
  if (!name) return res.status(400).json({ error: "供應商名稱為必填" });
  const id = nextVendorId();
  db.prepare(
    `INSERT INTO vendors (id, name, type, unit_habit, document_style, has_vendor_item_code)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, type || null, unit_habit || null, document_style || null, has_vendor_item_code ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM vendors WHERE id = ?").get(id));
});

router.patch("/vendors/:id", (req, res) => {
  const { name, type, unit_habit, document_style, has_vendor_item_code } = req.body;
  const result = db
    .prepare(
      `UPDATE vendors SET
         name = COALESCE(@name, name),
         type = COALESCE(@type, type),
         unit_habit = COALESCE(@unit_habit, unit_habit),
         document_style = COALESCE(@document_style, document_style),
         has_vendor_item_code = COALESCE(@has_vendor_item_code, has_vendor_item_code)
       WHERE id = @id`
    )
    .run({
      name: name ?? null,
      type: type ?? null,
      unit_habit: unit_habit ?? null,
      document_style: document_style ?? null,
      has_vendor_item_code: has_vendor_item_code === undefined ? null : has_vendor_item_code ? 1 : 0,
      id: req.params.id,
    });
  if (result.changes === 0) return res.status(404).json({ error: "找不到這個供應商" });
  res.json(db.prepare("SELECT * FROM vendors WHERE id = ?").get(req.params.id));
});

router.delete("/vendors/:id", (req, res) => {
  const id = req.params.id;
  const usedByMapping = db.prepare("SELECT COUNT(*) AS n FROM vendor_item_mappings WHERE vendor_id = ?").get(id).n;
  const usedByReceipt = db.prepare("SELECT COUNT(*) AS n FROM receipts WHERE vendor_id = ?").get(id).n;
  if (usedByMapping > 0 || usedByReceipt > 0) {
    return res.status(409).json({
      error: `這個供應商還有 ${usedByMapping} 筆對照表、${usedByReceipt} 筆單據關聯，不能刪除。`,
    });
  }
  const result = db.prepare("DELETE FROM vendors WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "找不到這個供應商" });
  res.status(204).end();
});

// ---------- 廠商對照表 ----------

function getMappingWithNames(id) {
  return db
    .prepare(
      `SELECT m.*, v.name AS vendor_name, s.name AS store_item_name
       FROM vendor_item_mappings m
       LEFT JOIN vendors v ON v.id = m.vendor_id
       LEFT JOIN store_items s ON s.code = m.store_item_code
       WHERE m.id = ?`
    )
    .get(id);
}

router.get("/mappings", (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, v.name AS vendor_name, s.name AS store_item_name
       FROM vendor_item_mappings m
       LEFT JOIN vendors v ON v.id = m.vendor_id
       LEFT JOIN store_items s ON s.code = m.store_item_code
       ORDER BY m.status DESC, v.name`
    )
    .all();
  res.json(rows);
});

router.post("/mappings", (req, res) => {
  const {
    vendor_id,
    vendor_item_code,
    vendor_item_name_raw,
    store_item_code,
    vendor_unit,
    store_unit,
    conversion_rate,
    pack_content_qty,
    status,
    note,
  } = req.body;
  if (!vendor_id || !vendor_item_name_raw) {
    return res.status(400).json({ error: "供應商、廠商品名為必填" });
  }
  const info = db
    .prepare(
      `INSERT INTO vendor_item_mappings
         (vendor_id, vendor_item_code, vendor_item_name_raw, store_item_code, vendor_unit, store_unit, conversion_rate, pack_content_qty, status, note)
       VALUES (@vendor_id, @vendor_item_code, @vendor_item_name_raw, @store_item_code, @vendor_unit, @store_unit, @conversion_rate, @pack_content_qty, @status, @note)`
    )
    .run({
      vendor_id,
      vendor_item_code: vendor_item_code ?? null,
      vendor_item_name_raw,
      store_item_code: store_item_code ?? null,
      vendor_unit: vendor_unit ?? null,
      store_unit: store_unit ?? null,
      conversion_rate: conversion_rate ?? null,
      pack_content_qty: pack_content_qty ?? null,
      status: status || (store_item_code ? "confirmed" : "needs_confirmation"),
      note: note ?? null,
    });
  res.status(201).json(getMappingWithNames(info.lastInsertRowid));
});

router.patch("/mappings/:id", (req, res) => {
  const {
    vendor_item_code,
    vendor_item_name_raw,
    store_item_code,
    vendor_unit,
    store_unit,
    conversion_rate,
    pack_content_qty,
    status,
    note,
  } = req.body;
  const result = db
    .prepare(
      `UPDATE vendor_item_mappings SET
         vendor_item_code = COALESCE(@vendor_item_code, vendor_item_code),
         vendor_item_name_raw = COALESCE(@vendor_item_name_raw, vendor_item_name_raw),
         store_item_code = CASE WHEN @store_item_code_set = 1 THEN @store_item_code ELSE store_item_code END,
         vendor_unit = COALESCE(@vendor_unit, vendor_unit),
         store_unit = COALESCE(@store_unit, store_unit),
         conversion_rate = COALESCE(@conversion_rate, conversion_rate),
         pack_content_qty = COALESCE(@pack_content_qty, pack_content_qty),
         status = COALESCE(@status, status),
         note = COALESCE(@note, note)
       WHERE id = @id`
    )
    .run({
      vendor_item_code: vendor_item_code ?? null,
      vendor_item_name_raw: vendor_item_name_raw ?? null,
      // store_item_code需要能被明確清成null（例如取消對照），跟其他欄位的「undefined代表不更新」語意不同
      store_item_code_set: store_item_code !== undefined ? 1 : 0,
      store_item_code: store_item_code ?? null,
      vendor_unit: vendor_unit ?? null,
      store_unit: store_unit ?? null,
      conversion_rate: conversion_rate ?? null,
      pack_content_qty: pack_content_qty ?? null,
      status: status ?? null,
      note: note ?? null,
      id: req.params.id,
    });
  if (result.changes === 0) return res.status(404).json({ error: "找不到這筆對照" });
  res.json(getMappingWithNames(req.params.id));
});

router.delete("/mappings/:id", (req, res) => {
  const result = db.prepare("DELETE FROM vendor_item_mappings WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "找不到這筆對照" });
  res.status(204).end();
});

export default router;
