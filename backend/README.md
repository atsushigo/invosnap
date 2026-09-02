# InvoSnap Backend

Node.js + Express + SQLite（better-sqlite3）API，實作 [docs/03-architecture-proposal.md](../docs/03-architecture-proposal.md) 的資料模型。

## 執行

```bash
npm install
cp .env.example .env   # 填入你的 ANTHROPIC_API_KEY 才能真的呼叫Vision API辨識，見docs/10
npm run dev             # 或 npm start
```

伺服器啟動時會自動建表，並在 `receipts`/`vendors` 等表是空的情況下，從專案根目錄的 `data/*.json`（見 [docs/09](../docs/09-store-item-master-and-vendor-mapping.md)）載入種子資料。資料庫檔案在 `backend/data/invosnap.db`（已加入.gitignore，不會進repo）。

沒有設定 `ANTHROPIC_API_KEY` 時，除了「拍照辨識」這個動作會回傳502錯誤外，其餘API（列品項、列供應商、瀏覽/覆核/確認/匯出既有單據）都能正常運作。

## API 一覽

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/catalog/vendors` | 供應商清單 |
| GET | `/api/catalog/store-items` | 店內標準品項清單 |
| GET | `/api/catalog/mappings` | 供應商品項對照表 |
| POST | `/api/receipts/recognize` | 上傳照片（multipart欄位名`photo`），呼叫Vision API辨識並建立單據 |
| GET | `/api/receipts` | 單據列表 |
| GET | `/api/receipts/:id` | 單據詳情（含明細） |
| PATCH | `/api/receipts/:id/lines/:lineId` | 覆核頁修正一列明細（`store_item_code`、`confirmed`） |
| POST | `/api/receipts/:id/confirm` | 確認入帳（要求所有明細都已confirmed，否則回409） |
| GET | `/api/receipts/export/csv` | 匯出已confirmed單據的內部標準格式CSV（見docs/07模組四） |
