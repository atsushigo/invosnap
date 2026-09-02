# 03. 系統架構提案（Node.js + Vue）

依技術人員指定的偏好，前端採 Vue、後端採 Node.js。

## 整體流程

```
店長手機拍照
   │
   ▼
[Vue 前端 — 拍照/上傳頁]
   │  上傳圖片 (multipart/form-data)
   ▼
[Node.js 後端 API]
   │  1. 圖片預處理（可選：裁切、壓縮、旋轉校正）
   │  2. 呼叫 LLM Vision API（Claude 等），帶入固定 JSON schema prompt
   ▼
[LLM 回傳結構化 JSON]
   （廠商猜測、品項陣列：[{品名, 單價, 數量, 原始單位}, ...]）
   │
   ▼
[後端：套用「供應商對照表」]
   - 依辨識出/選擇的供應商，查詢單位換算規則
   - 品名比對到店內標準品項代碼（模糊比對 + 人工確認新品項）
   - 換算成店內統一單位與價格
   ▼
[Vue 前端 — 覆核/修正頁]
   - 店長看到辨識結果表格，逐列確認/修改
   - 標記「新供應商 / 新品項」時可即時建檔對照規則
   ▼
[店長按下「確認入帳」]
   ▼
[Node.js 後端 — 寫入本地資料庫]
   │
   ▼
[匯出 CSV/Excel 給POS匯入] 或 [未來：呼叫POS API寫入]
```

## 為什麼「人工覆核」是必要步驟，不是可選項

辨識再準也會有錯（尤其單價、數量這種容錯度低的數字），因此設計上不做「自動直接入帳」，而是「辨識→預填→人工一鍵確認」，把AI當作「幫你把資料打好草稿」，而不是「幫你做決定」。這樣即使辨識偶爾出錯，店長覆核一眼也能抓到，不會直接污染進出貨帳目。

## 技術棧建議

| 層 | 技術 | 說明 |
|---|---|---|
| 前端 | Vue 3 + Vite | 拍照上傳、覆核表單UI |
| 前端（手機相機） | 瀏覽器原生 `<input type="file" capture="environment">` 或 PWA | 先用純網頁+相機權限即可，不必一開始就做原生App；若後續需要更好的相機體驗（多張連拍、離線暫存）再評估 Capacitor 包裝成App |
| 後端 | Node.js + Express（或 Fastify） | 提供上傳、辨識代呼叫、對照表CRUD、匯出等API |
| 影像辨識 | Claude API（vision，結構化輸出） | 見 [02](02-ocr-tech-research.md)，MVP階段建議方案 |
| 資料庫 | SQLite（單店/MVP）→ 未來可換 PostgreSQL（多店/雲端） | 單店資料量小，SQLite足夠且部署簡單（單一檔案，適合先跑在店內一台電腦/NAS或小型雲主機） |
| 檔案儲存 | 本機檔案系統 或 雲端物件儲存（如 S3-compatible） | 存原始單據照片，供日後追溯/覆核用 |
| 匯出 | CSV / Excel（如 `exceljs`） | 對接POS匯入功能（若POS支援匯入的話，見[04](04-roadmap-open-questions.md)） |

## 資料模型（初版）

```
Vendor（供應商）
  - id
  - name（廠商名稱）
  - default_unit（該廠商慣用單位，如：台斤/公斤/箱，僅作預設值，仍需逐品項確認）
  - notes

VendorItemMapping（供應商品項對照/單位換算表）★核心業務規則表，非AI猜測
  - id
  - vendor_id
  - vendor_item_code（供應商自己的品項編號，可為null；若有，比對優先用這個，見09）
  - vendor_item_name（供應商單據上寫的品名，可能各廠商叫法不同）
  - store_item_id → StoreItem
  - unit_conversion_rate（供應商單位 → 店內標準單位的度量衡換算率，例：1台斤 = 0.6公斤）
  - pack_content_qty（包裝內容量，可為null，例：黑豆干以「包」計價但每包內容量2斤——這跟度量衡換算是不同維度，見09）
  - vendor_unit（來源單位）
  - store_unit（目標/店內標準單位）
  - status（confirmed / needs_confirmation / new_item——比對狀態，跟辨識信心是分開的兩件事，見09）

StoreItem（店內標準品項主檔）
  - id
  - name（店內統一叫法，如：青江菜）
  - standard_unit（店內統一單位，如：公斤）
  - category（葉菜類/根莖類/肉品/滷包料...視需要）

Receipt（單張進貨單記錄，對應一張拍照的紙本單）
  - id
  - vendor_id
  - photo_url（原始照片存檔路徑）
  - captured_at
  - status（辨識中/待覆核/已確認/已匯出）
  - raw_ocr_json（LLM原始回傳，供除錯/覆核比對用）

ReceiptLine（單據明細列，一張Receipt對多筆）
  - id
  - receipt_id
  - vendor_item_name_raw（辨識出的原始品名文字）
  - store_item_id（人工確認/系統比對後對應到的標準品項）
  - qty_raw / unit_raw（原始數量與單位）
  - qty_converted / unit_converted（換算後的店內單位數量）
  - unit_price（單價，注意：若供應商單位換算，單價也需要對應換算，非單純數量換算）
  - confirmed（是否已人工確認）
```

## 辨識 Prompt / Schema 設計要點（給 LLM Vision API）

- 明確要求輸出固定 JSON schema（例如：`vendor_name_guess`, `date_guess`, `items: [{name, qty, unit, unit_price}]`），並在prompt中舉幾個真實單據範例（few-shot），提升穩定性。
- 若辨識不確定（例如字跡模糊），要求模型明確標記 `confidence: low` 或留空，而不是硬猜一個數字——寧可讓店長補填，也不要讓模型「編造」一個看起來合理但錯誤的數字。
- 建議先用少量真實單據照片做小規模測試（10~20張），評估辨識穩定度與常見錯誤類型（例如是否常把「台斤」看成「公斤」），再決定要不要加額外的後處理規則。

## 單位換算：務必獨立於辨識邏輯

這是整個系統「正確性」最重要的一塊，且**完全不該依賴辨識模型去猜換算率**——換算規則要在 `VendorItemMapping` 表中由人工事先建好、店長可自行維護（例如一個簡單的後台表單：選供應商、填品名、填換算率）。辨識模型只需要抓出「原始寫的數字與單位文字」，換算永遠由系統依規則表計算，確保帳目正確且可追溯來源。

## 部署建議（MVP）

- 單店使用，資料量小：可以先用一台小型雲主機（或甚至店內電腦）跑 Node.js + SQLite，不需要複雜的雲端架構。
- 若之後考慮擴散到其他分店，再評估換成集中式後端（PostgreSQL + 多租戶資料模型，每店一個 store_id）。
