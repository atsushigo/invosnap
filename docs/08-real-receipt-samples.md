# 08. 真實單據驗證樣本（2026/09/02，已去識別化）

2026/09/02 首次拿到店長提供的3張真實供應商單據照片，直接用 Claude（對話中內建視覺能力，未呼叫付費API，零成本）示範辨識。這份文件記錄辨識結果與從真實資料學到的東西，**修正/補充** [06-vision-prompt-schema.md](06-vision-prompt-schema.md) 原本基於模擬單據的假設。

> 去識別化說明：以下保留供應商公司名稱、品項編號、價格等對設計有幫助的資訊；業務員/聯絡人姓名、電話、門牌號碼等個人/敏感資訊已略去或以「(略)」標示。
>
> **更正（同日）**：樣本3原本誤判為「店內自己填的手寫叫貨登記單」，店長補充說明後確認這其實是**供應商阿凱生蔬開來的正式出貨單**（我方稱進貨單、供應商稱出貨單），也是電腦列印格式，不是手寫——已更正下方內容與結論。

## 重大發現：三張全部是電腦列印格式，不是手寫複寫單

原本 [06](06-vision-prompt-schema.md) 假設多數單據是「三聯式複寫紙手寫單」，但實際3張**全部是電腦列印的結構化單據**：

| 單據 | 供應商 | 格式 | 辨識難度 |
|---|---|---|---|
| 樣本1 | 乾貨/加工食材供應商（公司全名略） | 電腦列印「銷貨單」，欄位齊全，**每個品項有廠商自己的品項編號** | 低 |
| 樣本2 | 生鮮蔬果供應商（公司全名略） | 電腦列印「銷貨憑單」，雙欄並排 | 低～中（數量常為小數台斤） |
| 樣本3 | **阿凱生蔬** | 電腦列印「出貨單」（供應商透過叫貨專線接單後印出），品名使用生鮮批發業界通用簡稱（如「大陸妹」「交白筍」），拍攝時圖片橫向、有陰影 | 低（格式）／中（單純因為拍攝角度與陰影） |

**真正的辨識難點被重新定位**：三張單據本身格式都不差，樣本3辨識信心偏低的主因是**照片拍攝方式**（橫向、光線陰影遮住部分格線），不是單據本身潦草難認。這對整體可行性是好消息——代表比對/辨識的核心風險比原本想的更小，但也代表「拍照品質守門」模組（見 [07](07-key-modules-feasibility.md) 模組二）的重要性其實更高：同一張單據，拍正、拍平、光線均勻，辨識信心可以從medium/low直接拉到high。

**設計影響（更新 [07-key-modules-feasibility.md](07-key-modules-feasibility.md) 模組一）**：樣本1的供應商在單據上就附了**自己的品項編號**（如 B0002、D0007-1），這比純靠品名模糊比對可靠得多。品項比對模組應該優先用「（供應商ID, 供應商品項編號）→ 店內標準品項」做比對，只有在沒有品項編號的單據（如樣本2、3）才退回用品名比對／LLM語意比對。

**設計影響（新發現，生鮮批發業界慣用簡稱）**：樣本3的「大陸妹」「交白筍」「五香豆干」等不是隨意手寫縮寫，而是生鮮批發業界的**通用商品簡稱/黑話**，同一種簡稱在不同供應商之間高機率是一致的。比對模組除了「供應商內部對照表」，長期也可以額外維護一份「生鮮批發業界通用簡稱對照表」（例如「大陸妹」固定對應到某種萵苣），跨供應商共用，減少每加一家新供應商就要從零開始建對照表的重複工作。

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

## 樣本3：阿凱生蔬出貨單（電腦列印，登錄專線叫貨模式）

供應商透過電話叫貨專線接單後列印的出貨單，品名為生鮮批發業界通用簡稱。因拍攝時圖片橫向、有陰影遮蓋部分格線，整體信心中等，**建議店長核對品名縮寫的實際所指**：

```json
{
  "vendor_name_guess": "阿凱生蔬",
  "date_guess": "2026-09-02",
  "customer_guess": "川醉湘（台北仁愛）",
  "items": [
    {"name_raw":"大陸妹韭菜","qty_raw":"1","unit_raw":"斤","unit_price_raw":"65","amount_raw":"65","confidence":"medium"},
    {"name_raw":"高麗菜","qty_raw":"2.9","unit_raw":"斤","unit_price_raw":"40","amount_raw":"104","confidence":"medium"},
    {"name_raw":"茭白筍(去殼大)","qty_raw":"1","unit_raw":"斤","unit_price_raw":"150","amount_raw":"150","confidence":"medium"},
    {"name_raw":"金針菇(大包B)","qty_raw":"1","unit_raw":"包","unit_price_raw":"310","amount_raw":"310","confidence":"medium"},
    {"name_raw":"白蘿蔔","qty_raw":"4","unit_raw":"斤","unit_price_raw":"25","amount_raw":"100","confidence":"medium"},
    {"name_raw":"五香豆干(2條)","qty_raw":"1","unit_raw":"斤","unit_price_raw":"50","amount_raw":"50","confidence":"medium"},
    {"name_raw":"娃娃菜","qty_raw":"3","unit_raw":"包","unit_price_raw":"35","amount_raw":"105","confidence":"medium"},
    {"name_raw":"蔥花","qty_raw":"1","unit_raw":"斤","unit_price_raw":"120","amount_raw":"120","confidence":"medium"},
    {"name_raw":"溫室(50顆)","qty_raw":"1","unit_raw":"包","unit_price_raw":"350","amount_raw":"350","confidence":"low"},
    {"name_raw":"玉米筍(10包)","qty_raw":"1","unit_raw":"盒","unit_price_raw":"25","amount_raw":"250","confidence":"low"}
  ],
  "total_amount_on_receipt": "1604",
  "notes": "明細加總約1604，與訂單金額一致；因拍攝角度橫向＋陰影，部分品名信心僅medium，重拍一張正向、光線均勻的照片預期可提升到high"
}
```

## 這次驗證對整體設計的結論（更正版）

1. **辨識可行性初步驗證通過**：三張單據的品名/數量/單價都能被合理抽取，明細加總對得上單據總計，符合 [06](06-vision-prompt-schema.md) 設計的schema與流程。
2. **三張單據格式都不差，都是電腦列印**——原本擔心的「複寫紙潦草手寫單」在這3個樣本中沒有出現。真正影響辨識信心的是**拍照方式**（角度、光線、是否疊放遮擋），不是單據本身難認。這比預期更樂觀，但也代表「拍照品質守門」（[07](07-key-modules-feasibility.md) 模組二）的投資報酬率比原先評估更高——同一張單據光是拍正、拍平、光線均勻，辨識信心就能有感提升。
3. **拍照習慣需要提醒店長**：樣本1的多頁單據疊放拍攝導致後段被遮擋、樣本3橫向+陰影導致信心下降——這兩者都是「使用者教育」層面就能解決的低成本問題，可以直接寫進之後App的拍照引導文案（例如：一次一頁、正向拍攝、避免陰影）。
4. **品項編號是意外的加分項**：至少一家供應商單據上已經有自己的品項編號，比對模組應優先利用這點（見上方模組一更新）。
5. **生鮮批發業界通用簡稱**：「大陸妹」「交白筍」等是業界通用叫法，不是單一供應商的隨機縮寫，值得建立一份跨供應商共用的簡稱對照表，降低新增供應商時的建檔成本。
6. 下一步：等更多天/更多供應商的單據累積起來，可以看出「同一家供應商的格式穩定度」，這會決定要不要幫每家供應商各自做few-shot範例；也建議之後拍照時盡量正向、單頁、光線均勻，方便做「同一張單據拍照品質好壞 vs 辨識信心」的對照實驗。
