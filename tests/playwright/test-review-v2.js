const { chromium } = require("playwright");

const BASE = "http://localhost:5174";
const RECEIPT_ID = 17; // 需要一筆20品項左右的多品項單頁單據（測欄寬/optgroup/新增品項）
const errors = [];
function assert(cond, msg) {
  if (!cond) errors.push(msg);
  console.log(cond ? "PASS" : "FAIL", "-", msg);
}

(async () => {
  const browser = await chromium.launch();
  // 模擬一個偏窄的視窗（跟使用者截圖的情況類似），確認卡片版型在窄畫面下也不會被壓扁
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(`${BASE}/receipts/${RECEIPT_ID}`);
  await page.waitForSelector("h2");
  if (await page.locator(".locked-notice").isVisible().catch(() => false)) {
    await page.click('button:has-text("重新開放編輯")');
    await page.waitForTimeout(500);
  }

  // 1. 卡片版型下品名輸入框吃滿卡片寬度，不會像table欄位那樣被壓扁
  const nameInputBox = await page.locator(".line-card").first().locator(".cell-input.name").boundingBox();
  assert(nameInputBox.width >= 300, `品名輸入框寬度足夠、遠比舊table版型寬 (實際 ${nameInputBox.width}px)`);
  const pageHorizontalScroll = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
  assert(!pageHorizontalScroll, "整個頁面不需要左右滑動就能看完內容");

  // 2. 品項下拉選單有用 optgroup 分類
  const optgroupCount = await page.locator(".line-card").first().locator(".line-card-bottom select optgroup").count();
  assert(optgroupCount >= 5, `對應店內品項下拉選單有分類optgroup (實際 ${optgroupCount} 組)`);

  // 3. 手動新增品項：只能選、不能自由輸入品名
  await page.click("text=＋ 手動新增品項");
  await page.waitForTimeout(200);
  const addFormNameInput = await page.locator(".add-line-form input[placeholder='數量']").count();
  const addFormHasFreeTextName = await page.locator(".add-line-form input[type='text']:not(.qty)").count();
  assert(addFormNameInput === 1, "新增表單有數量輸入框");
  assert(addFormHasFreeTextName === 0, "新增表單沒有自由輸入品名的欄位（只有select可選）");

  const addSelect = page.locator(".add-line-form select");
  const addOptgroupCount = await addSelect.locator("optgroup").count();
  assert(addOptgroupCount >= 5, `新增表單的品項選單也有分類optgroup (實際 ${addOptgroupCount} 組)`);

  // 4. 實際選一個品項、送出，確認name_raw跟store_item_code一致（不是打字打出來的）
  await addSelect.selectOption({ label: "高麗菜" });
  await page.waitForTimeout(100);
  await page.fill(".add-line-form input[placeholder='數量']", "3");
  await page.fill(".add-line-form input[placeholder='單價']", "45");
  const cardsBefore = await page.locator(".line-card").count();
  await page.click(".add-line-form button.primary");
  await page.waitForTimeout(500);
  const cardsAfter = await page.locator(".line-card").count();
  assert(cardsAfter === cardsBefore + 1, `新增後卡片數+1 (before=${cardsBefore}, after=${cardsAfter})`);

  const lastCardName = await page.locator(".line-card").last().locator(".cell-input.name").inputValue();
  const lastCardMatch = await page.locator(".line-card").last().locator(".line-card-bottom select").inputValue();
  assert(lastCardName === "高麗菜", `新增卡片的品名直接等於選擇的店內品項名稱 (實際: ${lastCardName})`);
  assert(lastCardMatch === "V002", `新增卡片自動對應到正確的店內品項代碼 (實際: ${lastCardMatch})`);
  // 欄位順序：數量、單位、單價、金額，單位是第2個 .field
  const lastCardUnit = await page.locator(".line-card").last().locator(".line-card-fields .field").nth(1).locator("input").inputValue();
  assert(lastCardUnit === "台斤", `選品項後單位自動帶入標準單位 (實際: ${lastCardUnit})`);

  // 5. 清理剛剛新增的測試卡片，讓資料庫回到乾淨狀態
  page.once("dialog", (d) => d.accept());
  await page.locator(".line-card").last().locator("button.danger").click();
  await page.waitForTimeout(400);
  const cardsAfterCleanup = await page.locator(".line-card").count();
  assert(cardsAfterCleanup === cardsBefore, `清理測試卡片後數量還原 (實際 ${cardsAfterCleanup})`);

  assert(consoleErrors.length === 0, `無console錯誤 (實際: ${JSON.stringify(consoleErrors)})`);

  await browser.close();
  console.log("\n=== SUMMARY ===");
  if (errors.length === 0) { console.log("ALL PASS"); process.exit(0); }
  console.log(`${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(" -", e));
  process.exit(1);
})().catch((e) => { console.error("TEST SCRIPT ERROR:", e); process.exit(1); });
