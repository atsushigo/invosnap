/**
 * 一次把 tests/playwright/*.js 需要的假資料種進SQLite，印出實際拿到的receipt id，
 * 跑完記得對照印出來的id，手動更新各支測試檔案開頭的 *_RECEIPT_ID 常數（如果對不上）。
 *
 * 不會呼叫任何付費API，純粹直接寫DB，零成本。
 *
 * 用法：cd backend && node ../tests/playwright/seed-fixtures.js
 * （要在 backend/ 目錄下跑，因為要用它的 node_modules 裡的 better-sqlite3）
 */

import db from "../../backend/src/db.js";

// fixture A：兩張真的不同的照片檔案，對應 test-multipage.js 的 Part A
// 借用 backend/uploads/ 裡已經存在的兩張真實測試照片（如果被清掉了，隨便換兩個現有檔名即可）
const photoA1 = "2dd543bebd48360609f518be1af71a42.jpg";
const photoA2 = "f5bcecf50a52f3c6c3e0c1ca20b61652.jpg";

function seedTwoPhotoFixture() {
  const id = db
    .prepare(
      `INSERT INTO receipts (vendor_id, vendor_name_guess, photo_filename, captured_at, date_guess, status, raw_ocr_json, total_amount_on_receipt, notes)
       VALUES ('VEN003','阿凱生蔬',?, datetime('now'), '2026-09-02', 'pending_review', '{}', '454', '[]')`
    )
    .run(photoA1).lastInsertRowid;
  db.prepare("INSERT INTO receipt_photos (receipt_id, filename, page_number) VALUES (?,?,1)").run(id, photoA1);
  db.prepare("INSERT INTO receipt_photos (receipt_id, filename, page_number) VALUES (?,?,2)").run(id, photoA2);
  const ins = db.prepare(
    `INSERT INTO receipt_lines (receipt_id, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, store_item_code, confidence, confirmed, page_number)
     VALUES (?,?,?,?,?,?,?,?,0,?)`
  );
  ins.run(id, "高麗菜", "2.9", "斤", "40", "104", "V002", "high", 1);
  ins.run(id, "溫室(50顆)", "1", "包", "350", "350", null, "low", 2);
  return id;
}

function seedThreeSheetsInOnePhotoFixture() {
  const id = db
    .prepare(
      `INSERT INTO receipts (vendor_id, vendor_name_guess, photo_filename, captured_at, date_guess, receipt_no_guess, status, raw_ocr_json, total_amount_on_receipt, total_pages_guess, notes)
       VALUES ('VEN001','鮮味嘉企業有限公司',?, datetime('now'), '2026-09-01', '202609010150', 'pending_review', '{}', '15991', 3, ?)`
    )
    .run(photoA1, JSON.stringify(["此送貨單共3頁，只拍了1張照片但照片裡看得到3張紙疊在一起"])).lastInsertRowid;
  db.prepare("INSERT INTO receipt_photos (receipt_id, filename, page_number) VALUES (?,?,1)").run(id, photoA1);
  const ins = db.prepare(
    `INSERT INTO receipt_lines (receipt_id, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, store_item_code, confidence, confirmed, page_number)
     VALUES (?,?,?,?,?,?,?,?,0,?)`
  );
  ins.run(id, "加拿大前腿豬肉捲", "1", "包", "440", "440", "P001", "high", 1);
  ins.run(id, "澳洲羊肉捲", "1", "包", "710", "710", "P002", "high", 1);
  ins.run(id, "九層薑之揚", "1", "包", "480", "480", null, "medium", 2);
  ins.run(id, "黑輪", "1", "包", "300", "300", "P009", "high", 2);
  ins.run(id, "寬冬粉-元昱", "1", "包", "290", "290", "S004", "low", 3);
  return id;
}

function seedSimpleFourItemFixture() {
  const id = db
    .prepare(
      `INSERT INTO receipts (vendor_id, vendor_name_guess, photo_filename, captured_at, date_guess, status, raw_ocr_json, total_amount_on_receipt, notes)
       VALUES ('VEN002','雄泉鮮食企業股份有限公司',?, datetime('now'), '2026-08-30', 'pending_review', '{}', '431', '[]')`
    )
    .run(photoA1).lastInsertRowid;
  const ins = db.prepare(
    `INSERT INTO receipt_lines (receipt_id, name_raw, qty_raw, unit_raw, unit_price_raw, amount_raw, store_item_code, confidence, confirmed) VALUES (?,?,?,?,?,?,?,?,0)`
  );
  ins.run(id, "初秋高麗A*", "4.88", "台斤", "48.0", "234", "V002", "high");
  ins.run(id, "豆芽菜(1斤裝)", "2.00", "台斤", "16.0", "32", "D004", "high");
  ins.run(id, "黑豆干2斤/包", "1.00", "包", "89.0", "89", "D001", "medium");
  ins.run(id, "大陸妹B", "2.00", "台斤", "38.0", "76", "V001", "high");
  return id;
}

const twoPhotoId = seedTwoPhotoFixture();
const threeSheetsId = seedThreeSheetsInOnePhotoFixture();
const simpleId = seedSimpleFourItemFixture();

console.log("已建立測試fixture，請對照更新各測試檔案的常數：");
console.log(`  test-multipage.js  → TWO_PHOTO_RECEIPT_ID = ${twoPhotoId}`);
console.log(`  test-doctabs.js    → RECEIPT_ID = ${threeSheetsId}`);
console.log(`  test-review-redesign.js / test-review-v2.js → RECEIPT_ID = ${simpleId}（4品項單頁單據，適合兩支都用）`);
console.log("\n提醒：test-multipage.js的SINGLE_PAGE_RECEIPT_ID只要是任何一筆單頁單據即可，不強制要求特定id。");
console.log("測完記得清掉：對每個id跑 DELETE FROM receipt_lines/receipt_photos/receipts WHERE receipt_id=<id>");
