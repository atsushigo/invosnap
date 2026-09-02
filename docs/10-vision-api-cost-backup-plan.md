# 10. 影像辨識 API 費用試算與備案方案（系統化比較）

你問了兩件事：Claude Vision API 實際收費標準是什麼、以及有沒有更便宜的備案（包含「本地訓練」是否划算）。這份文件把答案整理成一張表，並給出明確的分層備案策略。

## 一、Claude Vision API 實際收費怎麼算

Anthropic 用「視覺token」計費，不是直接按張數收費。公式（官方文件）：

```
影像token數 = ⌈寬度px / 28⌉ × ⌈高度px / 28⌉
```

簡化估算：`tokens ≈ (寬px × 高px) / 750`。若圖片長邊超過1568px，會先自動縮小再算，單張圖片最高約1568 tokens（標準畫質）。也就是說**手機拍照隨便多高解析度，實際計費的token數是有上限的**，不會因為拍4000萬畫素的照片就爆費用。

本案一張送貨單（含prompt文字、店內品項清單、JSON輸出）粗估：

- 輸入：約1500~1600 tokens（圖片）＋約300~500 tokens（system prompt含品項清單，見09） ≈ **2000 tokens**
- 輸出：一張單據10個品項的JSON，約 **500 tokens**

> 註：今天（2026-09-02）Claude Sonnet 5 的「開站優惠價」已在8/31結束，目前正式牌價是 $3/M input、$15/M output；Haiku 4.5 維持 $1/M input、$5/M output。以下試算用現行牌價，而非之前文件中殘留的優惠價，之前幾份文件的估算數字會偏低，這份文件的數字才是目前準確的。

## 二、系統化比較表

以本案單量（約15張/天、450張/月）試算：

| 方案 | 供應商/執行位置 | Input 費率($/M tokens) | Output 費率($/M tokens) | 估算每張成本 | 估算月成本(450張) | 整合難度 | 建議角色 |
|---|---|---|---|---|---|---|---|
| **Claude Sonnet 5** | Anthropic雲端API | $3 | $15 | ~US$0.0135 | ~US$6.1 | 低（已整合，見scripts/） | **MVP主力**：準確度最佳、與現有腳本已串接 |
| Claude Haiku 4.5 | Anthropic雲端API | $1 | $5 | ~US$0.0045 | ~US$2.0 | 極低（同一支SDK，換一個model參數） | **同廠牌降成本備案**：準確度略降，適合量體變大或想省成本時切換，程式碼幾乎不用改 |
| Gemini 2.5 Flash | Google雲端API | $0.15 | $1.25 | ~US$0.0009 | ~US$0.4 | 中（需另外接Google的SDK/驗證） | **最便宜的雲端備案**：成本是Claude Sonnet的1/15，但要多維護一套整合，準確度需另外實測 |
| 自架開源VLM（Qwen2.5-VL / MiniCPM-V） | 自己租GPU（RunPod/Modal serverless） | GPU $0.4~1.1/小時（按秒計費） | — | 本案量體下 <US$0.05/天 | <US$2 | **高**：要部署vLLM、下載/管理模型、處理冷啟動、中文手寫準確度需自行驗證 | **量體大幅成長（例如擴散到10店以上）時的長期方案**，本案規模不建議現在做 |
| 本地CPU量化小模型（完全離線） | 店內電腦/自己電腦CPU | 免費（僅電費） | — | US$0 | US$0 | 中高：模型較小、推論慢（可能每張30秒~2分鐘）、準確度明顯較低 | **純離線災難備援**，不建議當日常主力 |

## 三、關於「本地訓練」的澄清

你提到「可以的話也可以本地訓練之類的省錢」——這裡有兩個不同的概念需要分清楚：

1. **自架（self-host）一個現成的開源模型**：例如 Qwen2.5-VL、MiniCPM-V，這些是別人已經訓練好的公開模型權重，你只是租一台有GPU的機器把它跑起來，不用自己訓練。這是上表「自架開源VLM」那一列在講的事。
2. **從零訓練/微調一個自己的模型**：需要蒐集大量標註資料（至少幾千張標註好的單據）、租用更貴的訓練用GPU叢集、花時間調參數。**這件事在本案規模（單店、15張/天）完全不划算**——訓練成本（人力+算力）會遠遠超過直接用API幾年的費用，而且不會有品質保證。

**結論：不建議「訓練」，最多考慮「自架現成的開源模型」，而且以本案的量體，連自架都不必要——直接用API的費用低到可以忽略**（月成本US$0.4~6，比任何人的時薪都便宜太多）。

## 四、建議的分層備案策略

```
Phase 0（現在，MVP）
  → Claude Sonnet 5（現有腳本已支援）
      準確度優先，月成本 <US$10，可忽略

Phase 1（若成本變成明顯考量，或想要同廠牌容錯）
  → 切換成 Claude Haiku 4.5
      只改 scripts/claude-vision-ocr.js 裡的 model 參數字串即可，
      其餘程式碼、schema、prompt完全不用動

Phase 2（若想要更便宜或Claude API出狀況時的備援）
  → 加一個 Gemini 2.5 Flash 的備援分支
      需要另外寫一個介面層抽象化「呼叫哪個vision provider」，
      好處是不被單一供應商綁死，也對應02文件裡的多方案比較

Phase 3（只有在擴散到多店、單量大幅成長時才評估）
  → 自架開源VLM（Qwen2.5-VL等）
      需要額外的MLOps投入，本案規模不建議現在做
```

**這次不需要修改任何程式碼**——`scripts/claude-vision-ocr.js` 目前用的是Claude Sonnet 5，符合Phase 0的建議，先不用動。之後如果你明確想切到Haiku或加Gemini備援，再回來調整即可，架構上不需要重寫。

## 五、部署順序更新

依你的補充，部署順序改為：**先在本機/店內電腦跑通MVP，驗證整條流程沒問題後，再遷移到小型雲主機**。這個順序不影響任何程式碼設計——03文件的架構本來就是「SQLite本機檔案優先」，符合這個順序；等本機驗證穩定後，把SQLite檔案搬到雲主機上（或換成雲端Postgres）即可銜接第二階段，見已更新的 [03-architecture-proposal.md](03-architecture-proposal.md) 部署建議段落。

**雲端主機選擇（2026-09-02補充）**：你確認上雲會用Hetzner（既有side projects部署的地方，便宜）。但你目前的Hetzner伺服器 `[redacted-other-project-host]` 是 `trading-monorepo` 的正式環境，正在跑即時交易機器人，**強烈建議InvoSnap不要跟它共用機器**，另外開一台入門級新機器（CX22等級即可，月費約€4~5）專門跑InvoSnap。理由與細節見 [11-review-checklist.md](11-review-checklist.md) 第一節，這點需要你確認。

## 參考來源

- [Claude API Pricing 2026: Opus 4.8, Sonnet 4.6, Haiku 4.5 Costs](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude API Pricing (September 2026)](https://benchlm.ai/anthropic/api-pricing)
- [Vision - Claude Platform Docs（影像token計費公式）](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Gemini API Pricing Guide 2026](https://curlscape.com/blog/google-gemini-api-pricing-guide-2026)
- [Gemini 2.5 Flash API Pricing](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)
- [8 Top Open-Source OCR Models Compared](https://modal.com/blog/8-top-open-source-ocr-models-compared)
- [Deploy Vision Language Models on GPU Cloud: Qwen3-VL, Llama 4 Scout, InternVL3 Guide (2026)](https://www.spheron.network/blog/deploy-vision-language-models-gpu-cloud/)
- [RunPod Pricing in 2026](https://flexprice.io/blog/runprod-pricing-guide-with-gpu-costs)
- [Modal Pricing 2026: Serverless GPU & CPU Costs](https://costbench.com/software/ai-gpu-cloud/modal/)
