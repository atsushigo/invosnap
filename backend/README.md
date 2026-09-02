# InvoSnap Backend

Node.js + Express + SQLite（better-sqlite3）API，實作 [docs/03-architecture-proposal.md](../docs/03-architecture-proposal.md) 的資料模型。

## 取得並設定 ANTHROPIC_API_KEY

Claude Max 訂閱（claude.ai / Claude Code）**不含**這裡要用的API額度，兩個是分開計費的東西。要跑辨識功能，需要另外申請一組 Anthropic API key：

1. 到 [console.anthropic.com](https://console.anthropic.com) 用你的帳號登入（跟claude.ai可以是同一組帳號，但這是「開發者主控台」，跟訂閱頁面是分開的）。
2. 左側選單找到 **API Keys**，點 **Create Key**，取個名字（例如 `invosnap-local`），建立後**立刻複製起來**——之後就看不到完整key了。
3. 主控台的 **Billing** 頁面加一張付款卡、儲值一點額度（幾美元就綽綽有餘，見下方成本試算，本案月成本約US$0.4~6）。
4. 把key貼進 `backend/.env`（第一次要先 `cp .env.example .env`）：
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxx
   ```
5. 重新啟動後端（`npm run dev` 或 `npm start`）。啟動後呼叫 `GET /api/health` 應該會看到 `"vision_configured": true`；前端「拍照上傳」頁的橘色提醒橫幅也會消失。

**如果實際辨識時收到 `anthropic-workspace-id is required` 這個錯誤**：代表你在console.anthropic.com新版介面建立的是「身分連動（identity-linked）」型key，需要額外指定它屬於哪個workspace才能用。去 **Settings → Workspaces** 找到workspace ID（通常是 `wrkspc_` 開頭的字串），填進 `backend/.env` 的 `ANTHROPIC_WORKSPACE_ID`，重啟後端即可。

這組key請當密碼一樣保管，**不要**貼進git commit、Slack、聊天紀錄——`.env` 已經加進 `.gitignore`，正常操作不會不小心推上去，但複製貼上時自己也要小心。實際費用細節、有沒有更便宜的備案，見 [docs/10-vision-api-cost-backup-plan.md](../docs/10-vision-api-cost-backup-plan.md)。

## 執行

```bash
npm install
cp .env.example .env   # 填入你的 ANTHROPIC_API_KEY（見上方「取得並設定」）才能真的呼叫Vision API辨識
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
