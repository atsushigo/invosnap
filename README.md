# InvoSnap（進貨快照）

> 川醉湘麻辣烫/滷味連鎖店－門市供應商紙本進貨單 → POS 進出貨資料自動化建檔工具

## 這是什麼

店長每天要處理最多 5 家供應商、每家約 3 張 A4 紙本進貨單（品項、單價、重量/數量，各家單位不一）。
現況是手動把這些資料一筆一筆key進POS系統，費時又容易出錯，且總部POS暫無資源開發此功能。

InvoSnap 是一個獨立於總部POS之外的輔助小工具：手機拍照 → 影像辨識抽取結構化資料 → 依供應商對照表換算成店內統一單位/格式 → 產出可匯入（或未來可API串接）POS的進出貨資料。

## 文件索引

1. [專案總覽與範疇](docs/01-project-overview.md) — 問題定義、使用者、目標、非目標
2. [影像辨識技術調查](docs/02-ocr-tech-research.md) — OCR / Document AI / LLM Vision 方案比較與建議
3. [系統架構提案（Node.js + Vue）](docs/03-architecture-proposal.md) — 技術棧、資料模型、流程設計
4. [MVP 路線圖與待確認事項](docs/04-roadmap-open-questions.md)
5. [成本試算、開源方案與台灣市場參考](docs/05-cost-and-oss-reference.md)
6. [台灣送貨單格式模擬 + Vision Prompt/Schema 設計](docs/06-vision-prompt-schema.md) — 模擬單據範例、JSON schema、system prompt 設計
7. [關鍵模組設計與可行性討論](docs/07-key-modules-feasibility.md) — 品項比對、拍照守門、覆核流程、匯出解耦、維護介面
8. [真實單據驗證樣本（已去識別化）](docs/08-real-receipt-samples.md) — 2026/09/02首次真實單據辨識驗證結果
9. [川醉湘店內材料主檔與各廠商映射對照](docs/09-store-item-master-and-vendor-mapping.md) — 依真實單據建立的種子資料，見 [`data/`](data)
10. [影像辨識API費用試算與備案方案](docs/10-vision-api-cost-backup-plan.md) — Claude實際收費公式、Haiku/Gemini/自架開源VLM系統化比較表、分層備案策略
11. [待你Review的事項清單](docs/11-review-checklist.md) — 目前卡點總盤點，含Hetzner部署風險提醒

也可以直接開啟 `index.html`（分頁式整合版，含全部內容，適合快速瀏覽全貌）。

## 快速開始（本機MVP）

```bash
# 後端
cd backend
npm install
cp .env.example .env   # 填入你的 ANTHROPIC_API_KEY 才能真的辨識，見 docs/10
npm run dev

# 前端（另開一個終端機）
cd frontend
npm install
npm run dev
```

功能涵蓋：拍照上傳 → Vision API辨識 → 覆核頁（指定店內品項、標記信心度、確認入帳）→ 匯出CSV。詳見 [backend/README.md](backend/README.md)、[frontend/README.md](frontend/README.md)。核心API與前端UI已用Playwright自動化測試過一輪（拍照辨識本身因為要花真的API費用而跳過，其餘流程全部驗證過）。

## 驗證用腳本（尚未執行，需自備API key才會產生費用）

`scripts/claude-vision-ocr.js` 是依 [06](docs/06-vision-prompt-schema.md) 的 schema 設計、呼叫 Claude API 辨識送貨單照片的骨架腳本。Claude Max 訂閱額度不含 Anthropic API 用量，實際跑這支腳本才會依API用量計費（每張約US$0.01~0.015）。若想先零成本驗證辨識可行性，可直接把單據照片提供給對話中的 Claude 做示範辨識。

## 一句話結論（技術選型）

由於單日總量小（約15張/天）、供應商單據格式不一且沒有大量標註資料可訓練模型，**建議 MVP 直接採用多模態 LLM Vision API（如 Claude API）做「拍照→結構化JSON」的辨識**，而不是自建傳統 OCR + 版面辨識模型。成本每天不到 1 美元，開發速度最快，且對「每家格式都不同」這種小樣本場景最魯棒。

**影像辨識固定沿兩條路線發展（2026-09-03定案）**：主力是 **LLM Vision — Claude**（現在跑的就是這個）；備案／長期路線是**開源自架 PaddleOCR/Tesseract + 自寫規則**（不依賴外部API、長期單張成本趨近於0，但要自己為每家供應商寫版面解析規則）。詳見 [02-ocr-tech-research.md](docs/02-ocr-tech-research.md)、[10-vision-api-cost-backup-plan.md](docs/10-vision-api-cost-backup-plan.md)。
