# 11. 待你 Review 的事項清單（2026-09-02）

盤點目前整個專案，哪些地方需要你檢查/拍板才能繼續往下走。分成「一定要你決定」跟「我已經有建議、你確認就好」兩類。

## 一、雲端部署：Hetzner，但建議跟 trading-monorepo 分開機器

你提到上雲要用 Hetzner，因為side projects都部署在那邊、比較便宜。這個方向沒問題，但有一個**重要風險點要先跟你確認**：

你現有的 Hetzner 伺服器 `[redacted-other-project-host]`（CX33，Helsinki）目前是 `trading-monorepo` 專案的**正式環境**，跑著10個Docker容器，包含即時交易機器人（`[redacted-bot-name]`、`[redacted-bot-name]`、`[redacted-bot-name]`等）。這台機器最近才因為SSH金鑰救援花了兩次重開機才修復，而且：

- 目前有一個**還沒查出根因的OOM(記憶體不足)問題**：曾觀察到某個python程序被系統持續kill掉又重啟的迴圈，還沒排查完成
- `sam`帳號的密碼跟SSH私鑰**都沒有備份在任何密碼管理工具裡**，目前唯一的存取管道就是這台WSL機器上的金鑰

**我的建議：不要把InvoSnap跑在`[redacted-other-project-host]`上**，理由：
1. InvoSnap是完全不相關的餐飲小工具，混進交易機器人的正式環境，一旦InvoSnap這邊出問題（例如吃太多記憶體、當機），有機會拖累到正在跑真錢交易的機器人——風險不對等，不值得。
2. 那台機器本身已經有未解的OOM問題，資源餘裕不明，貿然再加一個服務可能讓問題更難排查、或直接引爆更嚴重的資源競爭。
3. Hetzner的入門級機型（CX22等）月費約€4~5，比起potential讓交易機器人出問題的風險，額外開一台新機器的成本可以忽略。

**建議做法**：在同一個Hetzner帳號/專案下，另外開一台小規格的新機器（CX22等級即可，InvoSnap的資源需求很小）專門跑InvoSnap，跟`[redacted-other-project-host]`完全隔離。這也符合Phase 1先在本機驗證、Phase 2才上雲的順序——上雲的時候用新機器，不會受trading-monorepo那邊的狀況影響。

> 這點我**認為需要你明確拍板**，因為涉及是否要花錢開新機器、以及風險判斷是你比較熟悉那台交易機器人主機現況。

## 二、一定要你決定/提供的事項

沿用並更新 [04-roadmap-open-questions.md](04-roadmap-open-questions.md) 的待確認清單，目前狀態：

| 事項 | 狀態 |
|---|---|
| POS系統是否支援匯入、匯入格式 | 未確認——這是目前唯一還會影響「匯出模組」實際設計的未知數 |
| POS系統廠牌名稱 | 未確認 |
| 供應商單據範例 | 部分：已有3家供應商的3張真實單據，店裡最多5家供應商，還有至少1~2家沒看過格式 |
| 單位換算規則來源 | 部分：真實資料顯示大多不需要複雜度量衡換算，但有5筆品項待確認（見09） |
| 新品項/新供應商處理流程 | 已有設計方案（`matched_store_item_code_guess` + `needs_confirmation`狀態），但沒跟店長最終拍板 |
| 資料存放位置 | 已定案：本機優先，之後Hetzner新機器 |
| **雲端主機是否要開新機器（本文件新增）** | 待你決定，見上方第一點 |
| Anthropic API金鑰由誰申請/付款 | 尚未討論——目前Claude Max訂閱不含API額度，正式跑起來需要一組獨立計費的API key |

## 三、我已經有建議、你確認就好的事項

這些我已經做了判斷並記錄在文件裡，除非你有不同意見，否則不需要額外討論：

- 影像辨識技術路線：LLM Vision API（Claude Sonnet 5起步），見[02](02-ocr-tech-research.md)、[10](10-vision-api-cost-backup-plan.md)
- 資料模型設計：`StoreItem`/`Vendor`/`VendorItemMapping`，已用真實資料驗證，見[03](03-architecture-proposal.md)、[09](09-store-item-master-and-vendor-mapping.md)
- 品項比對邏輯：優先用廠商品項編號，其次LLM語意比對，見[07](07-key-modules-feasibility.md)模組一
- 匯出格式：先做內部標準格式、跟POS解耦，等POS資訊確認後再加adapter，見[07](07-key-modules-feasibility.md)模組四
- 費用備案分層策略：Sonnet 5 → Haiku 4.5 → Gemini Flash → 自架開源模型，見[10](10-vision-api-cost-backup-plan.md)

## 四、現在可以開始寫程式嗎

**可以**，只要你對上面「一、雲端部署」的建議沒意見。程式碼開發（Node.js後端＋Vue前端＋SQLite）完全不受POS問題影響，可以先在本機動工；等你確認要開新Hetzner機器或有其他意見，我再照著調整部署那一段。

## 五、下一步建議順序

1. 你確認一下「開新Hetzner機器」這個判斷有沒有問題（或者你有更了解那台trading機器現況的資訊，可能OOM問題已經解決/風險比我判斷的低，那也可以直接說）
2. 我開始搭建本機MVP骨架（Node.js + Vue + SQLite），把已有的種子資料（`data/`）接進去
3. 之後有空，去跟店長要剩下1~2家供應商的單據範例、順便問一下09列出的5筆待確認品項、以及POS匯入方式
