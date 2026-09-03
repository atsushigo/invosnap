import { chromium } from "playwright";

const BASE = "http://localhost:5174";
const RECEIPT_ID = 34; // 需要一筆一般的4品項單頁單據，見 seed-fixtures.js 或直接用真實receipt
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

  // 0. Make test idempotent regardless of leftover state from a previous run
  if (await page.locator(".locked-notice").isVisible().catch(() => false)) {
    await page.click('button:has-text("重新開放編輯")');
    await page.waitForTimeout(500);
  }

  // 1. Split layout present
  assert(await page.locator(".split").isVisible(), "split-screen容器存在");
  assert(await page.locator(".photo-pane img").isVisible(), "左側照片預覽有渲染出圖片元素");
  const photoNaturalWidth = await page.locator(".photo-pane img").evaluate((img) => img.naturalWidth);
  assert(photoNaturalWidth > 0, `照片真的解碼成功、不是壞圖(naturalWidth=${photoNaturalWidth})`);
  assert((await page.locator(".line-card").count()) > 0, "右側改成卡片式版型，line-card有渲染出來");

  // 2. Zoom controls
  const zoomLabel = page.locator(".zlabel");
  assert((await zoomLabel.textContent()).trim() === "100%", "初始縮放100%");
  await page.click('.zbtn[title="放大"]');
  await page.waitForTimeout(100);
  assert((await zoomLabel.textContent()).trim() === "125%", "點放大後變成125%");
  await page.click('.zbtn[title="重設"]');
  await page.waitForTimeout(100);
  assert((await zoomLabel.textContent()).trim() === "100%", "重設回100%");

  // 3. Inline edit a field (name_raw of first card)
  const firstNameInput = page.locator(".line-card").first().locator(".cell-input.name");
  const originalName = await firstNameInput.inputValue();
  await firstNameInput.fill("測試修正品名");
  await firstNameInput.dispatchEvent("change");
  await page.waitForTimeout(400);
  const afterName = await firstNameInput.inputValue();
  assert(afterName === "測試修正品名", `行內編輯品名成功寫回並回填 (實際: ${afterName})`);
  // restore
  await firstNameInput.fill(originalName);
  await firstNameInput.dispatchEvent("change");
  await page.waitForTimeout(400);

  // 4. Add a manual line via the item-picker form (covered in depth by test-review-v2.js)
  const cardsBefore = await page.locator(".line-card").count();
  await page.click("text=＋ 手動新增品項");
  await page.waitForTimeout(200);
  await page.locator(".add-line-form select").selectOption({ label: "大陸妹（萵苣）" });
  await page.click(".add-line-form button.primary");
  await page.waitForTimeout(400);
  const cardsAfterAdd = await page.locator(".line-card").count();
  assert(cardsAfterAdd === cardsBefore + 1, `新增一列後卡片數+1 (before=${cardsBefore}, after=${cardsAfterAdd})`);

  // 5. Delete that new line (last card, with confirm dialog auto-accept)
  page.once("dialog", (d) => d.accept());
  await page.locator(".line-card").last().locator("button.danger").click();
  await page.waitForTimeout(400);
  const cardsAfterDelete = await page.locator(".line-card").count();
  assert(cardsAfterDelete === cardsBefore, `刪除該列後卡片數還原 (實際 ${cardsAfterDelete})`);

  // 6. Confirm all lines then confirm receipt
  const checkboxes = page.locator('.line-card input[type="checkbox"]');
  const cbCount = await checkboxes.count();
  for (let i = 0; i < cbCount; i++) {
    if (!(await checkboxes.nth(i).isChecked())) {
      await checkboxes.nth(i).check();
      await page.waitForTimeout(150);
    }
  }
  await page.click("button.primary");
  await page.waitForTimeout(500);
  const statusText = await page.locator(".review-pane .card p").first().textContent();
  assert(statusText.includes("已確認"), `確認入帳成功 (實際: ${statusText.trim()})`);

  // 7. Fields become disabled (readonly) after confirm
  const disabledAfterConfirm = await firstNameInput.isDisabled();
  assert(disabledAfterConfirm, "確認後欄位變成disabled，不能亂改");

  // 8. Locked notice + reopen flow
  assert(await page.locator(".locked-notice").isVisible(), "顯示已鎖定提示與重新開放編輯說明");
  await page.click('button:has-text("重新開放編輯")');
  await page.waitForTimeout(500);
  const statusAfterReopen = await page.locator(".review-pane .card p").first().textContent();
  assert(statusAfterReopen.includes("待覆核"), `重新開放編輯後狀態退回待覆核 (實際: ${statusAfterReopen.trim()})`);
  const enabledAfterReopen = !(await firstNameInput.isDisabled());
  assert(enabledAfterReopen, "重新開放編輯後欄位恢復可編輯");

  // 9. Re-confirm to restore original confirmed state (idempotent cleanup for repeatable testing)
  for (let i = 0; i < cbCount; i++) {
    if (!(await checkboxes.nth(i).isChecked())) {
      await checkboxes.nth(i).check();
      await page.waitForTimeout(100);
    }
  }
  await page.click("button.primary");
  await page.waitForTimeout(400);

  assert(consoleErrors.length === 0, `無console錯誤 (實際: ${JSON.stringify(consoleErrors)})`);

  await browser.close();
  console.log("\n=== SUMMARY ===");
  if (errors.length === 0) { console.log("ALL PASS"); process.exit(0); }
  console.log(`${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(" -", e));
  process.exit(1);
})().catch((e) => { console.error("TEST SCRIPT ERROR:", e); process.exit(1); });
