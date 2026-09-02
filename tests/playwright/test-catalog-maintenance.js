// 驗證「主檔維護」頁：店內主檔/供應商/廠商對照表 三個tab的CRUD、以及菜單式分類/供應商切換列都能跑，
// 零成本（不呼叫Vision API），見 tests/playwright/README.md
import { chromium } from "playwright";

const BASE = "http://localhost:5174";
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  console.log("導覽到主檔維護頁");
  await page.goto(`${BASE}/catalog`);
  await page.waitForSelector(".catalog-view");
  assert(await page.locator("nav.topnav a", { hasText: "主檔維護" }).count() > 0, "上方導覽列有「主檔維護」連結");

  // ---------- 店內主檔（菜單式：分類切換列 + 卡片格） ----------
  console.log("\n[店內主檔] 分類切換列");
  assert(await page.locator(".menu-nav button", { hasText: "配料/其他" }).count() === 1, "分類切換列有「配料/其他」這個分類籤");

  console.log("[店內主檔] 新增品項");
  const uniqueName = `測試品項-${Date.now()}`;
  await page.selectOption(".add-form select >> nth=0", "配料/其他");
  await page.fill(".add-form input[type=text] >> nth=0", uniqueName);
  await page.click(".add-form button.primary");
  await page.waitForTimeout(500);
  assert(await page.locator(".menu-card", { hasText: uniqueName }).count() === 1, "新品項出現在卡片格裡");

  console.log("[店內主檔] 分類籤能篩選出剛新增的品項");
  await page.locator(".menu-nav button", { hasText: "配料/其他" }).click();
  await page.waitForTimeout(200);
  assert(await page.locator(".menu-card", { hasText: uniqueName }).count() === 1, "點「配料/其他」籤後還看得到剛新增的品項");

  console.log("[店內主檔] 搜尋框能篩選品項");
  await page.fill(".menu-search", uniqueName);
  await page.waitForTimeout(200);
  assert(await page.locator(".menu-card").count() === 1, "搜尋剛新增品項的名稱後，卡片格只剩1張");
  await page.fill(".menu-search", "");
  await page.locator(".menu-nav button", { hasText: "全部" }).first().click();
  await page.waitForTimeout(200);

  console.log("[店內主檔] 編輯品項");
  const itemCard = page.locator(".menu-card", { hasText: uniqueName });
  await itemCard.locator("button.icon-btn").first().click();
  const renamedName = `${uniqueName}-改名`;
  await page.fill(".menu-card.editing input[type=text]", renamedName);
  await page.locator(".menu-card.editing button", { hasText: "儲存" }).click();
  await page.waitForTimeout(500);
  assert(await page.locator(".menu-card", { hasText: renamedName }).count() === 1, "改名後的品項出現在卡片格裡");

  console.log("[店內主檔] 刪除品項");
  page.once("dialog", (d) => d.accept());
  await page.locator(".menu-card", { hasText: renamedName }).locator("button.icon-btn.danger").click();
  await page.waitForTimeout(500);
  assert(await page.locator(".menu-card", { hasText: renamedName }).count() === 0, "刪除後品項從卡片格消失");

  // ---------- 供應商 ----------
  console.log("\n[供應商] 切換tab、新增供應商");
  await page.locator(".tabs button", { hasText: "供應商" }).click();
  await page.waitForTimeout(300);
  const uniqueVendor = `測試供應商-${Date.now()}`;
  await page.fill("section .add-form input[type=text] >> nth=0", uniqueVendor);
  await page.click("section .add-form button.primary");
  await page.waitForTimeout(500);
  assert(await page.locator(".row-item", { hasText: uniqueVendor }).count() === 1, "新供應商出現在列表裡");

  console.log("[供應商] 刪除供應商");
  page.once("dialog", (d) => d.accept());
  await page.locator(".row-item", { hasText: uniqueVendor }).locator("button", { hasText: "刪除" }).click();
  await page.waitForTimeout(500);
  assert(await page.locator(".row-item", { hasText: uniqueVendor }).count() === 0, "刪除後供應商從列表消失");

  // ---------- 廠商對照表（菜單式：供應商切換列 + 狀態篩選 + 卡片格） ----------
  console.log("\n[廠商對照表] 切換tab、新增對照");
  await page.locator(".tabs button", { hasText: "廠商對照表" }).click();
  await page.waitForTimeout(300);
  assert(await page.locator(".menu-nav button", { hasText: "全部供應商" }).count() === 1, "有「全部供應商」切換籤");
  const uniqueMappingName = `測試對照品名-${Date.now()}`;
  await page.selectOption("section .add-form select >> nth=0", { index: 1 });
  // form-row順序：供應商(select) / 廠商品項編號(input nth=0) / 廠商單據上的品名(input nth=1，必填)
  await page.fill("section .add-form input[type=text] >> nth=1", uniqueMappingName);
  await page.click("section .add-form button.primary");
  await page.waitForTimeout(500);
  assert(await page.locator(".menu-card", { hasText: uniqueMappingName }).count() === 1, "新對照出現在卡片格裡");

  console.log("[廠商對照表] 狀態篩選");
  await page.locator(".tab-filter button", { hasText: "待確認" }).click();
  await page.waitForTimeout(300);
  assert(await page.locator(".menu-card", { hasText: uniqueMappingName }).count() === 1, "篩選「待確認」還看得到剛新增的對照（預設狀態）");
  await page.locator(".tab-filter button", { hasText: "全部狀態" }).click();

  console.log("[廠商對照表] 刪除對照");
  page.once("dialog", (d) => d.accept());
  await page.locator(".menu-card", { hasText: uniqueMappingName }).locator("button.icon-btn.danger").click();
  await page.waitForTimeout(500);
  assert(await page.locator(".menu-card", { hasText: uniqueMappingName }).count() === 0, "刪除後對照從卡片格消失");

  assert(consoleErrors.length === 0, `過程中沒有非預期的console錯誤（實際 ${consoleErrors.length} 筆）`);
  if (consoleErrors.length > 0) console.log(consoleErrors);

  await browser.close();
  console.log(`\n通過 ${passed} / 失敗 ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
