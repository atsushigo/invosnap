# 13. Fanout多角度審查與修復記錄（2026-09-04）

用Claude Code的Workflow工具第一次在這個專案上實際用「多代理平行審查」（fanout）：5個角度同時展開review，每個發現再各自派一個獨立代理去嘗試推翻（對抗性驗證），只有真的推翻不了才算數。這篇記錄跑法跟結果，方便之後同樣的方式再跑一次。

## 為什麼用這個方式

MVP從upload→辨識→覆核→主檔維護→手機版優化→Tailscale Funnel對外開放，一路都是分批做的，**從來沒有一次完整回頭審查過**。5個角度彼此獨立、可以平行跑，比一個角度一個角度慢慢看快很多；每個發現又各自驗證一次，可以濾掉「看起來像bug其實程式碼已經擋住了」的假警報。

## 5個審查角度

1. **正確性/邏輯bug** — 讀`backend/src/routes/catalog.js`、`receipts.js`、`db.js`，找真的會導致錯誤結果的邏輯漏洞
2. **安全性** — 因為app現在透過Tailscale Funnel公開曝露在網路上，檢查SQL injection、CSV injection、CORS、檔案上傳限制等
3. **手機版/響應式** — iPhone 11之外的尺寸（iPad直向/橫向、Android常見尺寸、iPhone橫向），用Playwright截圖實際用眼睛看
4. **設計一致性** — 經過好幾輪改版後，顏色/圓角/陰影有沒有跑掉、沒有用`style.css`的CSS變數
5. **店長使用者體驗**（第一版跑完後使用者要求補上的）— 讓一個代理**假裝自己是不懂技術的店長**，實際用Playwright操作iPhone 11尺寸走一遍完整流程，不看程式碼、只看畫面截圖判斷文案看不看得懂、操作直不直覺

## 結果：19項發現，18項通過對抗性驗證確認為真

（1項被推翻：「覆核頁欄位看起來像純文字」的說法，驗證代理用程式碼證明每個欄位其實都有文字標籤，不成立）

### 已修復（2026-09-04，commit `cd0da62`）

**資料正確性**（`backend/src/routes/receipts.js`）：
- `PATCH /:id/lines/:lineId` 原本用`COALESCE(@store_item_code, store_item_code)`，導致沒辦法把品項對應明確清成null——沿用`catalog.js`的`PATCH /mappings/:id`已有的set-flag pattern修好
- `POST /:id/confirm` 原本在0筆明細時會vacuous-truth通過確認入帳，加了明細數量檢查
- `POST /:id/reopen` 原本沒有重置每列的`confirmed`勾選，導致「修正流程」形同虛設（改一列不勾同意，其他列還留著上次的已確認狀態，馬上又能送出確認），改成reopen時一併重置全部
- `POST /:id/lines`（手動新增品項）的`page_number`原本沒有邊界檢查，跟辨識流程的clamp邏輯不一致，補上
- CSV匯出補上公式注入防護（內容以`=+-@`開頭時前面加全形空白中和）

**店長使用體驗**：
- `ImageZoomViewer.vue` 原本只綁`mouse`事件，iPhone上完全沒反應——改用Pointer Events統一處理滑鼠/觸控，支援單指拖曳平移、雙指縮放、雙點快速放大
- 「確認入帳」在金額對不上時加一道`window.confirm`最終確認，不能無視紅字警告直接送出
- 信心度badge、店內品項對應下拉選單都補上文字標籤
- 覆核頁「請對照左側/上方照片」文案改成依`window.matchMedia('(max-width: 860px)')`動態顯示，不會在窄螢幕堆疊版面時還講「左側」
- 手機導覽抽屜每個連結加一行說明文字（例如「主檔維護」下面補「新增品項或供應商」），不重新命名任何既有名詞，避免牽動其他文件/測試

**設計一致性**：CatalogView/ReviewView/UploadView幾處寫死的顏色/圓角/陰影/按鈕尺寸改用`style.css`既有的CSS變數對齊。

### 刻意不修的部分

- **公開曝露/無流量限制的`/recognize`端點**：使用者評估後認為風險可接受——只有使用者跟店長知道網址，且Anthropic API key只儲值US$5、沒有自動加值，最壞情況就是燒完這$5，不構成真正的財務風險，決定不加驗證機制

## 跑法（下次同樣方式怎麼重跑）

Workflow腳本存在session的暫存目錄（跨session不保留），核心邏輯是`pipeline(DIMENSIONS, review階段, verify階段)`，5個角度定義成一個陣列、各自一段prompt，findings/verdict都用JSON Schema逼結構化輸出。之後如果要重跑類似的審查，可以參考本篇的5個角度描述，或直接請Claude重新設計。

## 順便發現的環境問題

`backend`用`node --watch`跑，理論上存檔會自動重啟，但實測**在這個WSL環境下，短時間內連續多次存檔可能只觸發一次重啟，導致後面幾次的程式碼變更沒有真的生效**（測`store_item_code`清null時，明明程式碼已經改對，API行為卻還是舊的，重新完整重啟backend process後才恢復正常）。**之後改完backend程式碼、要驗證行為前，如果不確定`--watch`真的重啟了，直接手動kill掉process重開比較保險**，不要完全信任`--watch`。
