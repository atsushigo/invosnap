# InvoSnap Frontend

Vue 3 + Vite。三個頁面：拍照上傳、單據列表、覆核頁。

## 執行

```bash
npm install
npm run dev
```

預設會嘗試用 5173 埠，被佔用時 Vite 自動改用下一個可用埠（終端機輸出會顯示實際網址）。開發模式下 `/api` 會透過 `vite.config.js` 的proxy轉發到後端 `http://localhost:3001`，所以要先啟動 `backend/`。

## 頁面

- `/upload`：選照片（`capture="environment"`會在手機上直接叫出相機）→ 呼叫辨識API → 導到覆核頁
- `/receipts`：單據列表，含「匯出已確認單據CSV」
- `/receipts/:id`：覆核頁——每列明細可指定對應的店內品項、勾選確認，明細加總跟單據總額對不上時會有警示，全部勾選確認後才能按「確認入帳」
