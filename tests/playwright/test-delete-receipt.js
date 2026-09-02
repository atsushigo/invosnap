const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:5174";
const UPLOAD_DIR = "/home/owner/Desktop/invosnap/backend/uploads";
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

  assert(fs.existsSync(path.join(UPLOAD_DIR, "delete-test.jpg")), "刪除前，測試照片檔案存在於uploads/");

  await page.goto(`${BASE}/receipts`);
  await page.waitForSelector("table");
  const rowsBefore = await page.locator("table tbody tr").count();
  assert(rowsBefore >= 1, `刪除前單據列表至少有1筆 (實際 ${rowsBefore})`);

  const targetRow = page.locator("table tbody tr", { hasText: "測試用可刪除單據" });
  assert((await targetRow.count()) === 1, "找到剛剛種的可刪除測試單據那一列");
  assert(await targetRow.locator("button.danger").isVisible(), "待覆核狀態的單據有顯示刪除按鈕");

  page.once("dialog", (d) => d.accept());
  await targetRow.locator("button.danger").click();
  await page.waitForTimeout(500);

  const rowsAfter = await page.locator("table tbody tr").count();
  assert(rowsAfter === rowsBefore - 1, `刪除後列表少了1筆 (before=${rowsBefore}, after=${rowsAfter})`);
  assert((await page.locator("table tbody tr", { hasText: "測試用可刪除單據" }).count()) === 0, "被刪除的單據不再出現在列表裡");

  await page.waitForTimeout(300); // 給後端一點時間做非同步的unlink
  assert(!fs.existsSync(path.join(UPLOAD_DIR, "delete-test.jpg")), "刪除單據後，對應的照片檔案也真的從硬碟移除了");

  // 已確認的單據不應該顯示刪除按鈕（要先重新開放編輯）
  await page.goto(`${BASE}/receipts`);
  await page.waitForSelector("table");
  const confirmedRow = page.locator("table tbody tr").filter({ has: page.locator(".badge.high") });
  const confirmedCount = await confirmedRow.count();
  if (confirmedCount > 0) {
    assert((await confirmedRow.first().locator("button.danger").count()) === 0, "已確認狀態的單據不顯示刪除按鈕");
  } else {
    console.log("SKIP - 目前沒有已確認狀態的單據可測這個規則");
  }

  assert(consoleErrors.length === 0, `無console錯誤 (實際: ${JSON.stringify(consoleErrors)})`);

  await browser.close();
  console.log("\n=== SUMMARY ===");
  if (errors.length === 0) { console.log("ALL PASS"); process.exit(0); }
  console.log(`${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(" -", e));
  process.exit(1);
})().catch((e) => { console.error("TEST SCRIPT ERROR:", e); process.exit(1); });
