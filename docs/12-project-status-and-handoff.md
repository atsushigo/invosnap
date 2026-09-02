# 12. 專案現況與交接筆記（2026-09-03）

給之後接續對話/新session用的「先看這篇」文件。對話上下文快滿時寫的，目的是讓下一個session不用重新爬梳整個對話記錄就能接手。

## 一句話現況

本機MVP已經可以跑，涵蓋「拍照上傳（支援多頁）→ Claude Vision辨識 → 覆核頁（卡片版型、行內編輯、單子分類分頁籤）→ 確認入帳 → CSV匯出」完整流程，已用2張真實供應商單據測過真實辨識且成功。程式碼、種子資料、文件都在GitHub私有repo：`https://github.com/atsushigo/invosnap`（分支`main`）。

## 怎麼啟動本機環境

```bash
cd ~/Desktop/invosnap/backend && npm install && npm run dev   # 需要backend/.env設定ANTHROPIC_API_KEY（可能還要ANTHROPIC_WORKSPACE_ID，見backend/README.md）
cd ~/Desktop/invosnap/frontend && npm install && npm run dev  # 預設想用5173，通常被占用會改用5174
```

前端會透過`vite.config.js`的proxy把`/api`和`/uploads`轉給後端(localhost:3001)。想讓別人（例如店長）用手機看，可以用`cloudflared tunnel --url http://localhost:5174`開一個臨時公開網址（本session之前用過`bids-vinyl-deemed-assignment.trycloudflare.com`，但那個網址是暫時的，session結束/electron重啟就會失效，需要重新產生）。

## 已完成的功能（程式碼層面）

**後端**（`backend/src/`）：
- `server.js` — Express入口，`/api/health`、`/api/catalog/*`、`/api/receipts/*`、靜態伺服`/uploads`
- `routes/receipts.js` — 拍照辨識(`POST /recognize`，支援多檔=多頁)、單據列表/詳情、覆核修正(`PATCH lines/:id`可訂正原始欄位)、刪除單一列、手動新增列、確認入帳、重新開放編輯、**整筆刪除單據**(`DELETE /:id`，含照片檔案)
- `routes/catalog.js` — 供應商/店內品項/對照表清單
- `vision.js` — 呼叫Claude Vision API，內含：sharp resize、多圖一次呼叫、寬鬆JSON解析（處理markdown包裝）、`stop_reason`截斷偵測、各種錯誤訊息中文化（缺key/workspace-id/額度不足/限流等）
- `db.js` — SQLite(better-sqlite3)，啟動自動建表+從`data/*.json`載入種子資料，簡易欄位遷移機制(`ensureColumn`)
- `schema.sql` — 資料模型：`vendors`/`store_items`/`vendor_item_mappings`/`receipts`/`receipt_lines`/`receipt_photos`

**前端**（`frontend/src/`）：
- `views/UploadView.vue` — 支援一次選多張照片（同一單據不同頁），可調順序/移除，health check偵測API key是否設定
- `views/ReviewView.vue` — **左右分割**（左：原始照片+縮放/全螢幕；右：辨識結果），品項是**卡片版型**(不是table，避免欄寬擠壓)，行內可編輯所有欄位，信心度標色，明細金額跟單據總額對不上會警示，**「全部／單子1／單子2／單子3」分頁籤**（依`page_number`區分同一張照片裡的不同紙本單子），已確認單據鎖定唯讀+「重新開放編輯」修正流程，手動新增品項強制從店內清單挑選(不開放自由輸入，避免打錯字)
- `views/ReceiptsView.vue` — 單據列表、CSV匯出、**刪除單據按鈕**（已確認的單據要先重新開放編輯才能刪）
- `components/ImageZoomViewer.vue` — 自寫的縮放/拖曳/全螢幕圖片檢視元件
- `lib/vision-prompt.js`（專案根目錄，backend跟scripts共用）— system prompt組裝，含店內品項清單、生鮮業界通用簡稱、多頁/多紙本判斷邏輯、`total_pages_guess`欄位

## 目前的真實資料狀態

DB裡目前有2筆真實辨識過的單據（receipt id 7、8），使用者**打算清掉這兩筆測試資料、重新拍照上傳**，用最新版的系統重新走一次完整流程。清掉的方式：去`/receipts`列表頁按每一列的「刪除」按鈕即可（7是已確認狀態，要先在覆核頁按「重新開放編輯」才能刪）。

## 費用與環境設定重點

- Claude Max訂閱**不含**Anthropic API額度，兩者分開計費，需要另外在console.anthropic.com申請API key、儲值
- 使用者的key是「身分連動(identity-linked)」型，需要額外在`backend/.env`填`ANTHROPIC_WORKSPACE_ID`（工作區ID：`wrkspc_xxxxxxxxxxxxxxxxxxxxxxxx`，可能已經填在使用者本機的`.env`裡，這個檔案不在git裡）
- 本案單量下每次辨識約US$0.01~0.03，改用`INVOSNAP_VISION_MODEL=claude-haiku-4-5`可以更省，但目前建議先用預設的Sonnet 5保準確度（見docs/10）
- **重要工作習慣**：使用者明確要求「不要濫用額度，先分析調查後再使用」——每次要花真的API費用前，先確認邏輯沒問題（用免費的方式測試，例如curl打格式錯誤的假檔案、或直接操作SQLite插入假資料來測UI），只在必要時才花一次真的辨識去驗證

## 測試方法論（使用者明確要求的工作習慣）

**每次改完程式碼，要自己用Playwright驗證過、確認沒問題才報告完成，不要丟未測過的東西給使用者。** 這個session累積的測試腳本原本放在scratchpad（session結束會消失），已經搬進repo的`tests/playwright/`目錄（見下方），未來session可以直接重跑或參考寫法，不用從零開始想怎麼測。

跑法：先確保backend跑在3001、frontend跑在5174（或调整腳本裡的`BASE`常數），部分測試需要先用DB腳本seed假資料（每支測試檔案開頭的註解或`tests/playwright/README.md`有說明），跑完記得清掉測試用的receipt(直接刪DB rows或用DELETE API)。

## 還沒解決的事情（見docs/04、docs/11完整清單）

1. **POS系統是否支援匯入、匯入格式** — 完全未知，目前只做好內部標準格式CSV匯出，跟POS解耦，之後確認了再加adapter
2. **供應商單據範例** — 目前只驗證過2家供應商（雄泉鮮食、鮮味嘉）的3張真實單據，店長最多有5家供應商，還有1~2家沒看過格式
3. **09文件列的5筆needs_confirmation品項** — 九層薑之揚、大陸妹韭菜是否誤合併、五香豆干的「2條」、溫室50顆是什麼、玉米筍盒/包關係，這些要問店長
4. **Hetzner雲端部署** — 使用者說之後再議，先確保本機部署順利。已有的判斷：不要跟`[redacted-other-project-host]`（trading-monorepo正式環境）共用機器，見docs/11
5. **多頁單子的doc-tabs功能還沒用真實多頁資料測過** — 目前只用假資料驗證UI邏輯，receipt 7/8是改這個功能*之前*辨識的舊資料，沒有page_number分類；等使用者重新上傳，可以看到真正的效果

## 文件索引（完整版見README.md）

01~11是專案脈絡/技術調查/架構/成本/待辦，本篇(12)是現況快照。網頁版整合文件：`index.html`，已發布成Artifact（`https://claude.ai/code/artifact/ac79de66-9fc8-4f33-b53b-24dd6e826dd6`），最後更新到分頁11，**還沒補上這篇(12)的內容跟後續幾輪的功能改動**（多頁單子分頁籤、刪除單據功能等）——如果之後要更新網頁版，記得把這些也同步進去。
