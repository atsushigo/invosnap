-- InvoSnap 資料模型，對應 docs/03-architecture-proposal.md 與 docs/09 的補充欄位

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  unit_habit TEXT,
  document_style TEXT,
  has_vendor_item_code INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS store_items (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  standard_unit TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_item_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  vendor_item_code TEXT,
  vendor_item_name_raw TEXT NOT NULL,
  store_item_code TEXT REFERENCES store_items(code),
  vendor_unit TEXT,
  store_unit TEXT,
  conversion_rate REAL,
  pack_content_qty REAL,
  status TEXT NOT NULL DEFAULT 'needs_confirmation', -- confirmed / needs_confirmation / new_item
  note TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT REFERENCES vendors(id),
  vendor_name_guess TEXT,
  photo_filename TEXT,
  captured_at TEXT,
  date_guess TEXT,
  receipt_no_guess TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review / confirmed / exported
  raw_ocr_json TEXT,
  total_amount_on_receipt TEXT,
  total_pages_guess INTEGER, -- 模型推斷單據總共幾頁，可能大於實際上傳的照片數（代表可能漏拍）
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id),
  vendor_item_code TEXT,
  name_raw TEXT NOT NULL,
  qty_raw TEXT,
  unit_raw TEXT,
  unit_price_raw TEXT,
  amount_raw TEXT,
  matched_store_item_code_guess TEXT,
  store_item_code TEXT REFERENCES store_items(code),
  confidence TEXT, -- high / medium / low
  confirmed INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER -- 這個品項是從第幾張照片(頁)辨識出來的，供覆核頁切換對照，可為null
);

-- 一張單據可能不只一張照片（例如多頁疊拍分開拍、或供應商單據本身就有好幾頁），
-- 依上傳順序記錄每一頁。舊資料（改schema前只支援單張照片）沒有這張表的資料，
-- 讀取時後端會拿 receipts.photo_filename 當作只有一頁的fallback。
CREATE TABLE IF NOT EXISTS receipt_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id),
  filename TEXT NOT NULL,
  page_number INTEGER NOT NULL
);
