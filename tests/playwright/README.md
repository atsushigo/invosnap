# Playwright 回歸測試

這些是開發過程中用來自我驗證UI改動的測試腳本（不是CI，手動跑），完全不呼叫Anthropic API，零成本。詳細背景見 [docs/12-project-status-and-handoff.md](../../docs/12-project-status-and-handoff.md)。

## 執行前準備

1. backend跑在 `localhost:3001`、frontend跑在 `localhost:5174`（`cd backend && npm run dev`、`cd frontend && npm run dev`）
2. 安裝依賴：`cd tests/playwright && npm install`（第一次可能需要 `npx playwright install chromium` 抓瀏覽器）
3. **先跑seed腳本產生測試資料**：
   ```bash
   cd backend && node ../tests/playwright/seed-fixtures.js
   ```
   會印出實際拿到的receipt id，把這些id貼進對應測試檔案開頭的 `*_RECEIPT_ID` 常數（通常id會一直往上累加，每次重跑都不一樣，這步驟省不掉）。

## 執行

```bash
cd tests/playwright
node test-review-redesign.js   # split-screen、縮放、行內編輯、新增/刪除列、確認鎖定、重新開放編輯
node test-review-v2.js         # 品名欄寬度、optgroup分類、手動新增品項強制選單不能打字
node test-multipage.js         # 多頁照片分頁籤、頁碼徽章、上傳頁多檔選取
node test-doctabs.js           # 「全部/單子1/單子2/單子3」分頁籤、缺頁警示
node test-delete-receipt.js    # 整筆刪除單據＋照片檔案清除（見下方特別說明）
```

`test-delete-receipt.js` 不吃 `seed-fixtures.js` 產生的資料，它自己內建一段seed邏輯（用檔名比對`測試用可刪除單據`那筆），跑之前確認 `backend/uploads/` 裡有 `2dd543bebd48360609f518be1af71a42.jpg` 可以複製（沒有的話換成任何現存的檔名）。

## 測完記得清理

```bash
cd backend && node --input-type=module -e "
import db from './src/db.js';
for (const id of [/* 剛剛seed出來的id們 */]) {
  db.exec(\`DELETE FROM receipt_lines WHERE receipt_id=\${id}; DELETE FROM receipt_photos WHERE receipt_id=\${id}; DELETE FROM receipts WHERE id=\${id};\`);
}
"
```

## 已知限制

- 測試腳本用固定的receipt id（常數），不是每次自動seed自動抓id自動代入——這是為了保持腳本簡單，但代表**每次跑之前都要手動同步id**，這件事沒有自動化，未來如果要接CI建議重構成每支測試自己呼叫API建立/清理資料，不依賴外部预先seed的固定id。
- `node_modules/` 不會進git（見 `.gitignore`），跑之前一定要 `npm install`。
