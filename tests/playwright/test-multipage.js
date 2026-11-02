import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE = "http://localhost:5174";
const TWO_PHOTO_RECEIPT_ID = 32; // 需要真的有2張receipt_photos的單據，見 seed-fixtures.js fixture A
const SINGLE_PAGE_RECEIPT_ID = 34; // 隨便一筆單頁單據，測「不該顯示分頁UI」
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

  // === Part A: 覆核頁的多頁切換（用種子資料 receipt id=9，2頁） ===
  await page.goto(`${BASE}/receipts/${TWO_PHOTO_RECEIPT_ID}`);
  await page.waitForSelector("h2");

  const tabs = page.locator(".page-tab");
  assert((await tabs.count()) === 2, `照片區顯示2個分頁籤 (實際 ${await tabs.count()})`);
  assert(await tabs.nth(0).evaluate((el) => el.classList.contains("active")), "預設第1頁分頁籤是active狀態");

  const imgBefore = await page.locator(".photo-pane img").getAttribute("src");
  await tabs.nth(1).click();
  await page.waitForTimeout(300);
  const imgAfter = await page.locator(".photo-pane img").getAttribute("src");
  assert(imgBefore !== imgAfter, "點第2頁分頁籤後，照片來源真的換了");
  assert(await tabs.nth(1).evaluate((el) => el.classList.contains("active")), "點擊後第2頁分頁籤變成active");

  // 品項卡片上的頁碼徽章應該存在，點擊能切回對應頁
  const pageBadges = page.locator(".page-badge");
  assert((await pageBadges.count()) === 2, `每張品項卡都有頁碼徽章 (實際 ${await pageBadges.count()})`);
  await pageBadges.nth(0).click(); // 第一張品項卡是第1頁的品項
  await page.waitForTimeout(300);
  const imgAfterBadgeClick = await page.locator(".photo-pane img").getAttribute("src");
  assert(imgAfterBadgeClick === imgBefore, "點第一張品項卡的頁碼徽章，照片切回第1頁");
  assert(await tabs.nth(0).evaluate((el) => el.classList.contains("active")), "分頁籤狀態也同步變回第1頁active");

  // === Part B: 卡片式版型不需要橫向捲動（改版重點） ===
  const hasTableScroll = await page.locator(".table-scroll").count();
  assert(hasTableScroll === 0, "覆核頁已經沒有.table-scroll這個橫向捲動容器了（改成卡片版型）");
  const lineCards = page.locator(".line-card");
  assert((await lineCards.count()) === 2, "line-card卡片渲染數量正確");

  // 單頁單據（receipt 7）不應該顯示分頁籤/頁碼徽章
  await page.goto(`${BASE}/receipts/${SINGLE_PAGE_RECEIPT_ID}`);
  await page.waitForSelector("h2");
  assert((await page.locator(".page-tabs").count()) === 0, "單頁單據不顯示分頁籤（只有1頁時不需要）");
  assert((await page.locator(".page-badge").count()) === 0, "單頁單據品項卡也不顯示頁碼徽章");

  // === Part C: 上傳頁支援多檔選取（不送出，不花錢） ===
  await page.goto(`${BASE}/upload`);
  await page.waitForSelector("h2");
  const fileInput = page.locator('input[type="file"]');
  assert(await fileInput.evaluate((el) => el.multiple === true), "上傳頁的檔案選取器允許多選(multiple屬性)");

  // 本機測試用：設定INVOSNAP_SAMPLE_PHOTOS_DIR指向一個含至少2張照片的資料夾即可跑這段；沒設定就跳過（見下方try/catch）
  const samplePhotoDir = process.env.INVOSNAP_SAMPLE_PHOTOS_DIR || "";
  let filesToUse = [];
  try {
    filesToUse = fs.readdirSync(samplePhotoDir).slice(0, 2).map((f) => path.join(samplePhotoDir, f));
  } catch {
    filesToUse = [];
  }
  if (filesToUse.length >= 2) {
    await fileInput.setInputFiles(filesToUse);
    await page.waitForTimeout(300);
    const thumbs = page.locator(".page-thumb");
    assert((await thumbs.count()) === 2, `選2張照片後顯示2個縮圖 (實際 ${await thumbs.count()})`);
    assert((await page.locator("button.primary").textContent()).includes("共2頁"), "開始辨識按鈕文字顯示「共2頁」");

    // 測試移除其中一張
    await page.locator(".page-thumb .page-actions button.danger").first().click();
    await page.waitForTimeout(200);
    assert((await thumbs.count()) === 1, "移除一張後縮圖剩1個");
  } else {
    console.log("SKIP - 找不到範例照片資料夾，跳過上傳頁的實際檔案選取測試（不影響其餘驗證）");
  }

  assert(consoleErrors.length === 0, `無console錯誤 (實際: ${JSON.stringify(consoleErrors)})`);

  await browser.close();
  console.log("\n=== SUMMARY ===");
  if (errors.length === 0) { console.log("ALL PASS"); process.exit(0); }
  console.log(`${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(" -", e));
  process.exit(1);
})().catch((e) => { console.error("TEST SCRIPT ERROR:", e); process.exit(1); });
