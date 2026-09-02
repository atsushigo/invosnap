import DatabaseConstructor from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data"); // 專案根目錄的 data/ 種子資料
const DB_PATH = join(__dirname, "..", "data", "invosnap.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseConstructor(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(readFileSync(join(__dirname, "schema.sql"), "utf8"));

function seedIfEmpty() {
  const vendorCount = db.prepare("SELECT COUNT(*) AS n FROM vendors").get().n;
  if (vendorCount > 0) return;

  const vendors = JSON.parse(readFileSync(join(DATA_DIR, "vendors.json"), "utf8"));
  const storeItems = JSON.parse(readFileSync(join(DATA_DIR, "store-items.json"), "utf8"));
  const mappings = JSON.parse(readFileSync(join(DATA_DIR, "vendor-item-mapping.json"), "utf8"));

  const insertVendor = db.prepare(
    `INSERT INTO vendors (id, name, type, unit_habit, document_style, has_vendor_item_code)
     VALUES (@id, @name, @type, @unit_habit, @document_style, @has_vendor_item_code)`
  );
  const insertStoreItem = db.prepare(
    `INSERT INTO store_items (code, name, category, standard_unit) VALUES (@code, @name, @category, @standard_unit)`
  );
  const insertMapping = db.prepare(
    `INSERT INTO vendor_item_mappings
       (vendor_id, vendor_item_code, vendor_item_name_raw, store_item_code, vendor_unit, store_unit, conversion_rate, status, note)
     VALUES (@vendor_id, @vendor_item_code, @vendor_item_name_raw, @store_item_code, @vendor_unit, @store_unit, @conversion_rate, @status, @note)`
  );

  const seedAll = db.transaction(() => {
    for (const v of vendors) {
      insertVendor.run({ ...v, has_vendor_item_code: v.has_vendor_item_code ? 1 : 0 });
    }
    for (const s of storeItems) {
      insertStoreItem.run(s);
    }
    for (const m of mappings) {
      insertMapping.run({
        vendor_id: m.vendor_id,
        vendor_item_code: m.vendor_item_code ?? null,
        vendor_item_name_raw: m.vendor_item_name_raw,
        store_item_code: m.store_item_code ?? null,
        vendor_unit: m.vendor_unit ?? null,
        store_unit: m.store_unit ?? null,
        conversion_rate: m.conversion_rate ?? null,
        status: m.status ?? "needs_confirmation",
        note: m.note ?? null,
      });
    }
  });
  seedAll();

  console.log(`已載入種子資料：${vendors.length}家供應商、${storeItems.length}項店內品項、${mappings.length}筆對照`);
}

seedIfEmpty();

export default db;
