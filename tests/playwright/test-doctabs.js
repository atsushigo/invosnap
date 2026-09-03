import { chromium } from "playwright";

const BASE = "http://localhost:5174";
const RECEIPT_ID = 33; // 需要一筆total_pages_guess>photos.length、品項有跨3個page_number的單據，見 seed-fixtures.js fixture B
const errors = [];
function assert(cond, msg) {
  if (!cond) errors.push(msg);
  console.log(cond ? "PASS" : "FAIL", "-", msg);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(`${BASE}/receipts/${RECEIPT_ID}`);
  await page.waitForSelector("h2");

  // 1. 缺頁警示：total_pages_guess=3但只有1張照片
  const warnings = await page.locator(".error-box").allTextContents();
  assert(warnings.some((w) => w.includes("共 3 頁") && w.includes("1 張照片")), `顯示缺頁警示 (實際: ${JSON.stringify(warnings)})`);

  // 2. 單子分頁籤：全部/單子1/單子2/單子3
  const tabs = page.locator(".doc-tab");
  const tabTexts = await tabs.allTextContents();
  console.log("分頁籤:", tabTexts.map((t) => t.trim()));
  assert((await tabs.count()) === 4, `分頁籤數量正確：全部+單子1+單子2+單子3 (實際 ${await tabs.count()})`);
  assert(tabTexts[0].includes("全部"), "第一個分頁籤是「全部」");
  assert(tabTexts[1].includes("單子1"), "第二個分頁籤是「單子1」");

  // 3. 預設顯示全部5筆
  assert((await page.locator(".line-card").count()) === 5, `預設「全部」分頁籤顯示5筆明細 (實際 ${await page.locator(".line-card").count()})`);

  // 4. 點「單子2」只顯示該張單子的2筆品項
  await tabs.nth(2).click(); // index 2 = 單子2
  await page.waitForTimeout(200);
  const lineCardsInTab2 = await page.locator(".line-card .cell-input.name").evaluateAll((els) => els.map((el) => el.value));
  assert(lineCardsInTab2.length === 2, `單子2分頁籤只顯示2筆明細 (實際 ${lineCardsInTab2.length})`);
  assert(lineCardsInTab2.includes("九層薑之揚") && lineCardsInTab2.includes("黑輪"), `單子2內容正確 (實際: ${JSON.stringify(lineCardsInTab2)})`);

  // 5. 點單子2分頁籤時該分頁籤要變成active
  assert(await tabs.nth(2).evaluate((el) => el.classList.contains("active")), "單子2分頁籤點擊後變成active");

  // 6. 切回「全部」應該恢復顯示5筆
  await tabs.nth(0).click();
  await page.waitForTimeout(200);
  assert((await page.locator(".line-card").count()) === 5, "切回「全部」後恢復顯示5筆");

  assert(consoleErrors.length === 0, `無console錯誤 (實際: ${JSON.stringify(consoleErrors)})`);

  await browser.close();
  console.log("\n=== SUMMARY ===");
  if (errors.length === 0) { console.log("ALL PASS"); process.exit(0); }
  console.log(`${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(" -", e));
  process.exit(1);
})().catch((e) => { console.error("TEST SCRIPT ERROR:", e); process.exit(1); });
