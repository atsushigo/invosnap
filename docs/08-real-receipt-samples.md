# 08. 真實單據驗證樣本（2026/09/02，已去識別化）

2026/09/02 首次拿到店長提供的3張真實供應商單據照片，直接用 Claude（對話中內建視覺能力，未呼叫付費API，零成本）示範辨識。這份文件記錄辨識結果與從真實資料學到的東西，**修正/補充** [06-vision-prompt-schema.md](06-vision-prompt-schema.md) 原本基於模擬單據的假設。

> 去識別化說明：以下保留供應商公司名稱、品項編號、價格等對設計有幫助的資訊；業務員/聯絡人姓名、電話、門牌號碼等個人/敏感資訊已略去或以「(略)」標示。

## 重大發現：不是每家都是手寫複寫單

原本 [06](06-vision-prompt-schema.md) 假設多數單據是「三聯式複寫紙手寫單」，但實際3張裡有2張是**電腦列印的結構化銷貨單**，只有1張接近手寫：

| 單據 | 供應商類型 | 格式 | 辨識難度 |
|---|---|---|---|
| 樣本1 | 乾貨/加工食材 | 電腦列印「銷貨單」，欄位齊全，**每個品項有廠商自己的品項編號** | 低 |
| 樣本2 | 生鮮蔬果 | 電腦列印「銷貨憑單」，雙欄並排 | 低～中（數量常為小數台斤） |
| 樣本3 | 疑似店內叫貨登記單 | 手寫勾選＋填數量，品名多為縮寫，圖片橫向拍攝 | 中～高 |

**設計影響（更新 [07-key-modules-feasibility.md](07-key-modules-feasibility.md) 模組一）**：樣本1的供應商在單據上就附了**自己的品項編號**（如 B0002、D0007-1），這比純靠品名模糊比對可靠得多。品項比對模組應該優先用「（供應商ID, 供應商品項編號）→ 店內標準品項」做比對，只有在沒有品項編號的單據（如樣本2、3）才退回用品名比對／LLM語意比對。這是原設計沒預期到的、比模擬單據更有利的情況。

## 樣本1：乾貨/加工食材供應商（電腦列印銷貨單）

```json
{
  "vendor_name_guess": "（乾貨/加工食材供應商，公司全名略）",
  "date_guess": "2026-09-01",
  "items": [
    {"vendor_item_code":"B0002","name_raw":"加拿大前腿豬肉捲[3公斤/包]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"440","amount_raw":"440","confidence":"high"},
    {"vendor_item_code":"B0003","name_raw":"澳洲羊肉捲[3公斤/包]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"710","amount_raw":"710","confidence":"high"},
    {"vendor_item_code":"B0005","name_raw":"巴拉圭嫩肩牛肉捲[3公斤/包]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"640","amount_raw":"640","confidence":"high"},
    {"vendor_item_code":"D0007-1","name_raw":"年糕片[30包/箱]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"65","amount_raw":"65","confidence":"high"},
    {"vendor_item_code":"D0007","name_raw":"年糕條[30包/箱]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"65","amount_raw":"65","confidence":"high"},
    {"vendor_item_code":"B0032-1","name_raw":"香蒜排骨酥[泰安][1KG/12包/箱]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"250","amount_raw":"250","confidence":"high"},
    {"vendor_item_code":"H0002","name_raw":"水晶餃[宏][市場]","qty_raw":"1.00","unit_raw":"盒","unit_price_raw":"60","amount_raw":"60","confidence":"high"},
    {"vendor_item_code":"A0058","name_raw":"二角油豆腐-台一","qty_raw":"1.00","unit_raw":"盒","unit_price_raw":"160","amount_raw":"160","confidence":"high"},
    {"vendor_item_code":"A0029-5","name_raw":"鑫鑫陽-捷香[5斤*5包/箱]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"405","amount_raw":"405","confidence":"high"},
    {"vendor_item_code":"A0002-03","name_raw":"級棒[阪原][5斤/6包/箱]","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"290","amount_raw":"290","confidence":"high"}
  ],
  "notes": "單據共3頁，本次僅第1頁完整拍攝，第2、3頁部分重疊遮擋，後段品項辨識信心較低；建議之後每頁分開拍一張照片，避免疊放"
}
```

## 樣本2：生鮮蔬果供應商（電腦列印銷貨憑單）

```json
{
  "vendor_name_guess": "（生鮮蔬果供應商，公司全名略）",
  "date_guess": "2026-08-30",
  "items": [
    {"name_raw":"初秋高麗A*","qty_raw":"4.88","unit_raw":"台斤","unit_price_raw":"48.0","amount_raw":"234","confidence":"high"},
    {"name_raw":"豆芽菜(1斤裝)","qty_raw":"2.00","unit_raw":"台斤","unit_price_raw":"16.0","amount_raw":"32","confidence":"high"},
    {"name_raw":"黑豆干2斤/包","qty_raw":"1.00","unit_raw":"包","unit_price_raw":"89.0","amount_raw":"89","confidence":"high"},
    {"name_raw":"大陸妹B","qty_raw":"2.00","unit_raw":"台斤","unit_price_raw":"38.0","amount_raw":"76","confidence":"high"}
  ],
  "total_amount_on_receipt": "431",
  "notes": "明細加總 234+32+89+76=431，與單據總計一致；備註欄寫「四角油豆腐 休息」代表本次缺貨/暫停供應——這種備註欄位的『缺貨聲明』模式值得辨識時保留下來，不要被當成雜訊丟掉"
}
```

## 樣本3：疑似店內叫貨登記單（手寫勾選，橫向拍攝）

辨識信心明顯較低，多個品名因手寫縮寫難以完全確定，**建議店長人工核對**：

```json
{
  "vendor_name_guess": "（疑似店內叫貨用登記單，非典型供應商送貨單格式）",
  "date_guess": "2026-09-02",
  "items": [
    {"name_raw":"（韭菜類，字跡不確定）","qty_raw":"1","unit_raw":"斤","unit_price_raw":"65","amount_raw":"65","confidence":"low"},
    {"name_raw":"高麗菜","qty_raw":"2.9","unit_raw":"斤","unit_price_raw":"40","amount_raw":"104","confidence":"medium"},
    {"name_raw":"茭白筍(去殼大)","qty_raw":"1","unit_raw":"斤","unit_price_raw":"150","amount_raw":"150","confidence":"low"},
    {"name_raw":"金針菇(大包B)","qty_raw":"1","unit_raw":"包","unit_price_raw":"310","amount_raw":"310","confidence":"medium"},
    {"name_raw":"白蘿蔔","qty_raw":"4","unit_raw":"斤","unit_price_raw":"25","amount_raw":"100","confidence":"medium"},
    {"name_raw":"五香豆干(2條)","qty_raw":"1","unit_raw":"斤","unit_price_raw":"50","amount_raw":"50","confidence":"low"},
    {"name_raw":"娃娃菜","qty_raw":"3","unit_raw":"包","unit_price_raw":"35","amount_raw":"105","confidence":"low"},
    {"name_raw":"蔥花","qty_raw":"1","unit_raw":"斤","unit_price_raw":"120","amount_raw":"120","confidence":"low"},
    {"name_raw":"（溫室50顆，品項不確定）","qty_raw":"1","unit_raw":"包","unit_price_raw":"350","amount_raw":"350","confidence":"low"},
    {"name_raw":"玉米筍(10包)","qty_raw":"1","unit_raw":"盒","unit_price_raw":"25","amount_raw":"250","confidence":"low"}
  ],
  "total_amount_on_receipt": "1604",
  "notes": "明細加總約1604，與單據上金額一致；但半數以上品名因手寫縮寫/字跡潦草而信心偏低，是三張樣本中最接近『真正困難案例』的一張"
}
```

## 這次驗證對整體設計的結論

1. **辨識可行性初步驗證通過**：三張單據的品名/數量/單價都能被合理抽取，明細加總對得上單據總計，符合 [06](06-vision-prompt-schema.md) 設計的schema與流程。
2. **難度分布比預期更分散**：2/3是結構清楚的電腦列印單，只有1/3接近「困難案例」。真正的辨識風險會集中在少數手寫/縮寫格式的供應商，不是全面性風險——覆核UI的低信心標記機制（模組三）在這類單據上特別重要。
3. **拍照習慣需要提醒店長**：樣本1的多頁單據疊放拍攝導致後段被遮擋，建議之後每頁分開拍、避免堆疊——這是一個成本很低但影響很大的「使用者教育」項目，可以直接寫進之後App的拍照引導文案。
4. **品項編號是意外的加分項**：至少一家供應商單據上已經有自己的品項編號，比對模組應優先利用這點（見上方模組一更新）。
5. 下一步：等更多天/更多供應商的單據累積起來，可以看出「同一家供應商的格式穩定度」，這會決定要不要幫每家供應商各自做few-shot範例。
