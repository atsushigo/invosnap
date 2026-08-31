# 02. 影像辨識技術調查（拍照單據 → 結構化資料）

這是整個專案技術難度最高的部分：把「供應商各自固定格式、A4大小的紙本進貨單照片」轉成「品項/單價/數量的結構化資料」。以下整理三大類方案。

## 方案分類

### A. 傳統開源 OCR + 版面/表格辨識（自架、免費）

代表工具：
- **Tesseract 5.x / Tesseract.js**：最成熟、社群最大的開源OCR引擎。優點是安裝體積小（約10MB）、單頁辨識速度快（<1秒）、可在Node.js中透過 Tesseract.js 直接跑（含瀏覽器端）。缺點：本身只做「文字辨識」，不含表格/版面結構化，中文（尤其手寫或印章）準確率普通，需要額外自己寫規則去切欄位。
- **PaddleOCR（含 PP-StructureV3 模組）**：百度開源，針對中文/亞洲語系優化，內建 layout analysis 與表格結構辨識，對「品項-單價-數量」這種表格類單據天生比較合適。缺點：主要是 Python 生態，體積較大（含模型檔可能到數 GB），要在 Node.js 專案中使用通常得包成獨立的 Python 微服務再由 Node 呼叫。
- **RapidOCR**：輕量化、模仿 PaddleOCR 效果但依賴更小，適合資源有限的環境。
- **Surya**：對版面/多欄位文件辨識較強，但相對新、生態較小。

**共同問題**：這類方案辨識出來的是「文字 + 位置」，仍需要自己寫「版面解析規則」才能對應到「這一格是品項、那一格是單價」。因為 5 家供應商格式都不同，等於要為每家寫一套規則，且供應商格式若微調，規則就可能失效。屬於「開發/維護成本較高，但長期單張成本趨近於0（不用付API費）」的路線。

### B. 雲端 Document AI／表格辨識服務（付費、免自訓練也可，但客製化仍需設定）

代表服務：
- **Google Cloud Document AI**：有「Form Parser／Invoice Parser」等預建處理器，也支援自訓練 Custom Extractor。定價約每千頁 US$1.5–30（依處理器類型）。
- **Azure AI Document Intelligence**：有預建 Invoice/Receipt 模型，也支援自訓練 Custom Model；預建模型定價約每千頁 US$10。自訓練模型準確度提升後，人工複核比例會下降，長期常比 Google 划算。
- **AWS Textract**：有 AnalyzeExpense（發票/收據）、表格擷取等功能；依功能不同每千頁約 US$1.5–65。

**特性**：這類服務對「標準發票/收據」辨識效果好，但對「每家供應商自訂、非標準格式的送貨單」，通常仍需個別建立/訓練 Custom Model（每個廠商格式各訓練一個樣板），初期需要蒐集每家供應商的多張範例單據來訓練，且三家雲端平台都需要相應雲端帳號與計費設定，導入門檻與前期工作量都不低，較適合供應商格式穩定、單量夠大之後再投入。

### C. 多模態 LLM Vision（拍照直接丟給大型視覺語言模型，要求輸出結構化 JSON）

代表：Claude（Anthropic）、GPT-4o/GPT-5（OpenAI）、Gemini 2.5 Pro/Flash（Google）等，透過 API 直接傳圖片＋prompt（描述欄位schema），模型直接回傳 JSON（廠商、品項陣列、單價、數量、單位），完全跳過傳統 OCR pipeline。

- 2026年市場行情：處理一頁單據約 US$0.01–0.03（依模型與圖片大小），且不需要事先為每家供應商建立樣板/訓練資料，模型本身有一定的「看圖理解版面」能力，即使格式不同也能抓出「這是一個品項表格」的結構。
- Gemini 2.5 Pro 在掃描/畫質較差的真實文件上準確率表現最好（獨立評測約94%），Gemini Flash 2.0 適合高量、重視成本效益，GPT-4o 適合需要額外推理（例如判斷模糊欄位）的複雜文件，Claude 系列適合對「幻覺風險」容忍度低、需要穩定輸出格式的流程。
- Node.js 生態已有現成模式可參考：例如開源專案 zerox 把「丟圖給視覺模型、拿回結構化文字」包成一個函式呼叫；也有多篇教學示範直接用 Node.js + Claude/GPT-4o API 做 invoice extraction。

**特性**：不需要蒐集訓練資料、不需要為每家供應商寫死解析規則，格式一變動也大多能自己適應（因為模型是「理解」而非「比對固定座標」），非常適合本專案「供應商格式不統一、單量又不大」的情境。缺點是有API使用費（雖然本案單量下每天成本很低）、且需要網路連線呼叫外部API（沒有離線需求的話不是問題），另外品項名稱、數量等如果被模型看錯需要人工覆核把關。

## 三種路線比較表

| 面向 | A. 傳統開源OCR自架 | B. 雲端Document AI | C. LLM Vision API |
|---|---|---|---|
| 前期開發成本 | 高（要為每家供應商寫解析規則） | 中～高（要蒐集範例、訓練Custom Model） | 低（設計好JSON schema+prompt即可） |
| 對「多家格式不同、格式會變」的適應力 | 差 | 中（格式變了要重新訓練） | 好（模型用「理解」而非死板比對） |
| 中文/表格辨識準確度 | 中（PaddleOCR較好，Tesseract較弱） | 高（但需訓練） | 高，且會持續隨模型版本進步 |
| 單張使用成本 | 幾乎0（本地運算） | 依方案，約每頁US$0.01–0.065 | 約每頁US$0.01–0.03 |
| 是否需要网络連線 | 可離線 | 需要 | 需要 |
| 是否需另建服務（Python等） | 需要（Node.js專案要包一層Python微服務） | 不需要（純API呼叫） | 不需要（純API呼叫，Node.js原生可呼叫REST） |
| 適合階段 | 量體變大、想長期壓低單價成本時 | 供應商格式穩定、單量夠大、想自訓練最佳化時 | **MVP 階段最適合** |

## 建議

**MVP 階段：採用方案 C（LLM Vision API，例如 Claude API 的 vision 功能）。**

理由：
1. 本案單日單量很小（約15張/天），API成本可忽略（估算每天US$0.15–0.45內，甚至更低）。
2. 5家供應商格式互異，且未來可能更換供應商或格式微調，傳統OCR/自訓練模型的規則維護成本，遠高於直接用LLM「理解」單據版面的成本。
3. 開發時程最短，符合「總部沒資源、店長想先有可用工具」的實際需求，能最快做出可用的原型驗證。
4. Node.js/Vue 技術棧下，串接 LLM Vision API 只是一支 REST 呼叫，前端用 Vue 做拍照/預覽/覆核UI即可，架構單純。

**長期／量體擴大後可考慮的路徑**：
- 若擴散到多分店、單量大幅提升，可評估改用「雲端 Document AI 自訓練 Custom Model」（方案B）或「PaddleOCR 自架」（方案A）以降低長期單價成本，但這屬於後續優化，不建議在MVP階段投入。
- 不論哪個階段，「單位換算表（台斤/公斤/箱…→店內標準單位）」都必須是明確維護的業務規則資料，不能期待任何辨識模型自己猜對——這點在 [03-architecture-proposal.md](03-architecture-proposal.md) 中會作為獨立資料表設計。

## 參考來源

- [Open-Source OCR Models: Tesseract, EasyOCR & More](https://www.ultralytics.com/blog/popular-open-source-ocr-models-and-how-they-work)
- [Paddle OCR vs Tesseract: (In-Depth OCR Comparison)](https://ironsoftware.com/csharp/ocr/blog/compare-to-other-components/paddle-ocr-vs-tesseract/)
- [Best Python OCR Library for Invoices: 6 Engines Compared (2026)](https://invoicedataextraction.com/blog/python-ocr-library-comparison-invoices)
- [Best Open Source OCR Tools 2026](https://imagetotable.ai/blog/best-open-source-ocr-tools-2026)
- [Open Source OCR for Invoice Extraction: Developer Comparison](https://invoicedataextraction.com/blog/open-source-ocr-invoice-extraction)
- [Vision LLM Invoice Extraction with Node.js: A Practical Guide](https://invoicedataextraction.com/blog/vision-llm-invoice-extraction-nodejs)
- [LLM API Pricing in 2026: The Complete Cost Comparison](https://www.aimagicx.com/blog/llm-api-pricing-comparison-2026)
- [Document Parsing: GPT-5 vs Claude vs Gemini vs Invofox — with Code Samples (2026)](https://www.invofox.com/en/blog/document-parsing-using-gpt-4o-api-vs-claude-sonnet-3-5-api-vs-invofox-api-with-code-samples/)
- [LLM OCR vs Traditional OCR: When AI Wins (and When It Doesn't) — 2026 Benchmark](https://parsli.co/blog/llm-ocr-vs-traditional-ocr)
- [Extract Invoice Data with JavaScript and Node.js](https://invoicedataextraction.com/blog/extract-invoice-data-javascript-nodejs)
- [AWS Textract vs Google Document AI vs Azure Document Intelligence (2026)](https://invoicedataextraction.com/blog/aws-textract-vs-google-document-ai-vs-azure-document-intelligence)
- [Textract vs Azure Document Intelligence vs Document AI 2026](https://triotechsystems.com/ai-engineering-guides-compare-textract-vs-document-intelligence-vs-document-ai/)
