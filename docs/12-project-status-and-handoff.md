# 12. 專案現況與交接筆記（2026-09-04，最後更新：fanout審查與修復）

給之後接續對話/新session用的「先看這篇」文件。對話上下文快滿時寫的，目的是讓下一個session不用重新爬梳整個對話記錄就能接手。

## 一句話現況

本機MVP已經可以跑，涵蓋「拍照上傳（支援多頁）→ Claude Vision辨識 → 覆核頁（卡片版型、行內編輯、單子分類分頁籤）→ 確認入帳 → CSV匯出」完整流程，已用2張真實供應商單據測過真實辨識且成功。程式碼、種子資料、文件都在GitHub私有repo：`https://github.com/atsushigo/invosnap`（分支`main`）。**2026-09-04用Workflow工具跑了一次5角度平行審查(fanout)+對抗性驗證，18項發現全部修復，細節見[13](13-fanout-review-2026-09-04.md)**——包含幾個真的會咬人的資料正確性bug（品項對應清不掉null、空單據能被確認入帳、重新開放編輯沒重置勾選狀態），以及店長使用體驗（照片檢視器手機上完全不能拖曳縮放、確認入帳沒有最後把關）。

## 怎麼啟動本機環境

```bash
cd ~/Desktop/invosnap/backend && npm install && npm run dev   # 需要backend/.env設定ANTHROPIC_API_KEY（可能還要ANTHROPIC_WORKSPACE_ID，見backend/README.md）
cd ~/Desktop/invosnap/frontend && npm install && npm run dev  # 預設想用5173，通常被占用會改用5174
```

前端會透過`vite.config.js`的proxy把`/api`和`/uploads`轉給後端(localhost:3001)。

## 想讓店長從外部連進來看：兩種分享網址機制

**重要（2026-11-03起）：對外分享一律走production build，不要再把vite dev server曝露出去**。之前是直接把`vite dev`（port 5174）透過Tailscale Funnel對外開放，但dev server本來就不是設計給公開曝露在網路上的（`npm audit`查到好幾個跟dev server直接相關的已知漏洞，包含「專案路徑跟系統路徑重疊時，`server.fs.allow`之外的檔案可能被讀到」這類路徑穿越問題）。現在改成：

```bash
cd ~/Desktop/invosnap/frontend && npm run build   # 產生 frontend/dist/，backend/src/server.js偵測到這個資料夾存在就會一起伺服
cd ~/Desktop/invosnap/backend && npm run dev       # 單一port(3001)同時伺服前端靜態檔+API，不用再另外跑vite dev
```

前端程式碼有改動、要更新對外看到的版本時，記得重新`npm run build`一次（backend不用重啟，`express.static`會讀到新的dist內容）。

**方式一（目前主用）：Tailscale Funnel，固定網址**

```bash
tailscale funnel --bg 3001   # 指向backend的port，不是frontend；需要先跑過一次 sudo tailscale up 登入、sudo tailscale set --operator=$USER
```

固定網址：跟這台機器(WSL裝置名`sam`)綁定，只要電腦開著、這個funnel程序還在跑，**網址永遠不變**，不用每次重新產生（實際網址基於隱私考量不寫進公開repo，問使用者或查本機Tailscale設定）。

- 關掉分享：`tailscale funnel --https=443 off`
- 檢查狀態：`tailscale funnel status` 或直接 `curl <你的tailnet網址>/api/health`
- 這個網址**沒有密碼保護**，知道連結的人都能打開用
- 電腦重開機後，Tailscale會自動重連，但`tailscale funnel --bg 3001`這個指令要重跑一次才會恢復對外服務（funnel設定不會自動存活過重開機，這點還沒驗證確認，之後可以觀察）

**方式二（備用）：Cloudflare Quick Tunnel，臨時網址**

```bash
/tmp/cloudflared tunnel --url http://localhost:3001   # 二進位檔可能還在/tmp，沒有的話要重新下載
```

每次執行都會產生一個新的隨機網址（例如之前用過的`bids-vinyl-deemed-assignment.trycloudflare.com`），session結束就失效，需要重新產生。適合臨時展示，不適合長期分享。

**兩種都不需要再管`frontend/vite.config.js`的`server.allowedHosts`**——那是vite dev server的安全機制，改成Express伺服production build之後就不適用了（`allowedHosts`設定還留著，是給單純本機開發、沒有要對外分享時用的`npm run dev`）。

## 已完成的功能（程式碼層面）

**後端**（`backend/src/`）：
- `server.js` — Express入口，`/api/health`、`/api/catalog/*`、`/api/receipts/*`、靜態伺服`/uploads`；`frontend/dist/`存在時也會一起伺服（production build）+ SPA路由fallback，CORS改成白名單（`INVOSNAP_CORS_ORIGINS`可覆寫，預設只開本機dev port）
- `routes/receipts.js` — 拍照辨識(`POST /recognize`，支援多檔=多頁)、單據列表/詳情、覆核修正(`PATCH lines/:id`可訂正原始欄位)、刪除單一列、手動新增列、確認入帳、重新開放編輯、**整筆刪除單據**(`DELETE /:id`，含照片檔案)
- `routes/catalog.js` — 供應商/店內品項/對照表清單
- `vision.js` — 呼叫Claude Vision API，內含：sharp resize、多圖一次呼叫、寬鬆JSON解析（處理markdown包裝）、`stop_reason`截斷偵測、各種錯誤訊息中文化（缺key/workspace-id/額度不足/限流等）
- `db.js` — SQLite(better-sqlite3)，啟動自動建表+從`data/*.json`載入種子資料，簡易欄位遷移機制(`ensureColumn`)
- `schema.sql` — 資料模型：`vendors`/`store_items`/`vendor_item_mappings`/`receipts`/`receipt_lines`/`receipt_photos`

**前端**（`frontend/src/`）：
- `views/UploadView.vue` — 支援一次選多張照片（同一單據不同頁），可調順序/移除，health check偵測API key是否設定
- `views/ReviewView.vue` — **左右分割**（左：原始照片+縮放/全螢幕；右：辨識結果），品項是**卡片版型**(不是table，避免欄寬擠壓)，行內可編輯所有欄位，信心度標色，明細金額跟單據總額對不上會警示，**「全部／單子1／單子2／單子3」分頁籤**（依`page_number`區分同一張照片裡的不同紙本單子），已確認單據鎖定唯讀+「重新開放編輯」修正流程，手動新增品項強制從店內清單挑選(不開放自由輸入，避免打錯字)
- `views/ReceiptsView.vue` — 單據列表、CSV匯出、**刪除單據按鈕**（已確認的單據要先重新開放編輯才能刪）
- `views/CatalogView.vue`（路由`/catalog`，導覽列「主檔維護」）— **新增（2026-09-03）**：把店內主檔／供應商／廠商對照表三份互相關聯的資料整合成一頁三個tab的CRUD介面，取代原本只能改`data/*.json`種子檔的方式。新增品項/供應商時代碼由後端自動產生（延續[09](09-store-item-master-and-vendor-mapping.md)的分類字首慣例），對照表的店內品項一樣是下拉選單不開放自由輸入。刪除有防呆（還被引用就擋掉）。對應後端`routes/catalog.js`新增的POST/PATCH/DELETE。細節見[07](07-key-modules-feasibility.md)模組五。
- `components/ImageZoomViewer.vue` — 自寫的縮放/拖曳/全螢幕圖片檢視元件
- `lib/vision-prompt.js`（專案根目錄，backend跟scripts共用）— system prompt組裝，含店內品項清單、生鮮業界通用簡稱、多頁/多紙本判斷邏輯、`total_pages_guess`欄位
- **整體視覺改版（2026-09-03）**：`frontend/src/style.css`＋`App.vue`重新設計配色/陰影/圓角token（參考Uber Eats等電子平台的專業感），引入Google Fonts的Inter＋Noto Sans TC字型（`frontend/index.html`），導覽列改成sticky+毛玻璃背景+logo mark。因為大部分元件本來就用CSS變數引用同一套色票，只改全域token就讓四個頁面(拍照上傳/單據列表/覆核頁/主檔維護)一起提升質感，沒有逐頁重寫

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

1. **待店長回答的問題已經整理成Google文件**（2026-09-03最新版，語氣已柔化成對店長比較有禮貌的用詞、POS那題移到最後標註不急）：`InvoSnap 進貨快照 — 待店長確認事項`——連結基於隱私考量不寫進公開repo，問使用者（擁有者是使用者私人Google帳號，跟本機Claude Code的Google Drive連接器綁定的帳號是同一個）。分成「店內主檔／廠商對照表(2題)／廠商基本資料／換算包裝規則／POS」6題。
   - 使用者手動把4張截圖（見下方）貼進了這份文件，但版面因為圖片太大跑掉了，已經給使用者手動調整版面的步驟（縮小成2x2表格），**還沒確認使用者有沒有實際弄完**，下次接手可以問一下或直接開連結看
   - 已經在對話中確認（不用再問）：新品項/新供應商流程＝當下手動建立對照＋之後要有統一整理功能（就是`/catalog`頁）；API費用由誰付先不問，還在試驗階段
   - 分享權限：目前只有使用者本人能編輯，**店長本人還沒有這份文件的存取權**，使用者說要直接發連結給店長（連結沒設「知道連結可編輯」，要嘛加店長email、要嘛之後去開連結分享）
2. **給店長的系統畫面預覽截圖**：4張存在`docs/store-manager-preview/`（repo裡）＋Windows桌面`invosnap-店長預覽截圖`資料夾，用來讓店長在正式試用前先看一下系統長怎樣，用意見docs/07/本篇
3. **讓店長從外部直接試用系統**：見上方「想讓店長從外部連進來看」，目前有Tailscale Funnel固定網址可以直接給店長，**但還沒實際發給店長、也還沒讓他點開實測過**。`/api/receipts/recognize`目前沒有任何驗證/流量限制（fanout審查發現的，見[13](13-fanout-review-2026-09-04.md)），使用者評估後**刻意決定不加防護**——只有使用者跟店長知道網址，且API key只儲值US$5沒有自動加值，最壞情況燒完$5，風險可接受
4. **POS系統是否支援匯入、匯入格式** — 完全未知，已列進Google文件
5. **供應商單據範例** — 目前只驗證過3家供應商（鮮味嘉、雄泉鮮食、阿凱生蔬），店長最多有5家供應商，還有1~2家沒看過格式，已列進Google文件
6. **Hetzner雲端部署** — 使用者說之後再議，先確保本機部署順利。已有的判斷：不要跟使用者既有的另一個正式環境共用機器，見docs/11
7. **多頁單子的doc-tabs功能還沒用真實多頁資料測過** — 目前只用假資料驗證UI邏輯，receipt 7/8是改這個功能*之前*辨識的舊資料，沒有page_number分類；等使用者重新上傳，可以看到真正的效果

## 文件索引（完整版見README.md）

01~12是專案脈絡/技術調查/架構/成本/待辦，本篇(12)是現況快照。網頁版整合文件：`index.html`，已發布成Artifact（`https://claude.ai/code/artifact/ac79de66-9fc8-4f33-b53b-24dd6e826dd6`），已更新到分頁12。**主檔維護頁(`/catalog`)是這篇更新之後才加的新功能，Artifact網頁版還沒同步這一段**，之後有空記得補。
