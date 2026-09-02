import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/vendors", (req, res) => {
  res.json(db.prepare("SELECT * FROM vendors ORDER BY name").all());
});

router.get("/store-items", (req, res) => {
  res.json(db.prepare("SELECT * FROM store_items ORDER BY category, code").all());
});

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

export default router;
