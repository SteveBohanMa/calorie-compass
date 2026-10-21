import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

// App-level checks for the v2.6 fixes and the v2.7 data rebuild. Runs against the Vite dev server from playwright.config.ts.

function current(page: Page) {
  return page.getByTestId("flow-current");
}

async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.locator(".lookup-hero")).toBeVisible();
}

async function openLookup(page: Page) {
  await openHome(page);
  await page.locator(".lookup-hero").click();
  await expect(page.locator(".method-grid")).toBeVisible();
}

async function openMyData(page: Page) {
  await openHome(page);
  await page.getByRole("button", { name: "我的数据" }).first().click();
  await expect(page.locator(".backup-card")).toBeVisible();
}

test("lookup only offers cooking methods that have foods", async ({ page }) => {
  test.setTimeout(90_000); // opens every tile in turn; slower against the Vite dev server
  await openLookup(page);
  const tiles = await page.locator(".method-bubble span").allTextContents();
  expect(tiles).toContain("关东煮");
  expect(tiles).not.toContain("汤煮");
  for (const empty of ["炸", "焖", "微波"]) expect(tiles).not.toContain(empty);

  for (const tile of tiles) {
    await page.locator(".method-bubble", { hasText: tile }).first().click();
    await expect(current(page).locator(".food-row").first(), `${tile} should list foods`).toBeVisible();
    await page.locator(".back-button").click();
    await expect(current(page).locator(".method-grid")).toBeVisible();
  }
});

async function search(page: Page, query: string) {
  await page.locator(".search-shell input").fill(query);
  await page.locator(".search-shell button[type=submit]").click();
}

test("the oden entry lists convenience-store oden items with a salt tip", async ({ page }) => {
  await openLookup(page);
  await page.locator(".method-bubble", { hasText: "关东煮" }).click();
  await expect(current(page).locator(".food-row").first()).toBeVisible();
  await expect(current(page).locator(".salt-tip")).toContainText("含盐");
  const names = await current(page).locator(".food-row strong").allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(20);
  for (const expected of ["关东煮白萝卜", "关东煮竹轮", "关东煮蟹味棒", "关东煮魔芋丝"]) {
    expect(names.some((name) => name.includes(expected)), expected).toBe(true);
  }
  expect(names.every((name) => name.includes("关东煮"))).toBe(true);
});

test("the salt tip only appears for braised foods and oden", async ({ page }) => {
  await openLookup(page);
  await page.locator(".method-bubble", { hasText: "卤·炖" }).click();
  await expect(current(page).locator(".salt-tip")).toContainText("含盐");
  await page.locator(".back-button").click();
  await page.locator(".method-bubble", { hasText: "蒸" }).first().click();
  await expect(current(page).locator(".food-row").first()).toBeVisible();
  await expect(current(page).locator(".salt-tip")).toHaveCount(0);
});

test("food details show sourced nutrients, grade and source", async ({ page }) => {
  await openLookup(page);
  await page.locator(".method-bubble", { hasText: "蒸" }).first().click();
  await current(page).locator(".food-row").first().click();
  const card = current(page).locator(".macro-card");
  await expect(card.locator(".macro-pending")).toHaveCount(0);
  await expect(card).toContainText(/\d+(?:\.\d+)? g \/ 100 g/);
  await expect(card).toContainText(/USDA FoodData Central|日本食品标准成分表|配方估算/);
  await expect(card).toContainText(/[ABC] · /);
});

test("store-dependent foods tell the user to check the label", async ({ page }) => {
  await openLookup(page);
  await search(page, "饭团");
  await current(page).locator(".food-row").first().click();
  const card = current(page).locator(".macro-card");
  await expect(card).toContainText("C · 典型值，以包装为准");
  await expect(card.locator(".food-note")).toContainText("按配方估算");
});

test("rebuilt foods are visible; removed and pending foods are not", async ({ page }) => {
  await openLookup(page);
  for (const query of ["蓝莓", "牛油果", "三文鱼"]) {
    await search(page, query);
    await expect(current(page).locator(".food-row").first(), query).toBeVisible();
    await page.locator(".back-button").click();
    await expect(current(page).locator(".method-grid")).toBeVisible();
  }
  for (const query of ["鹿肉", "洋蓟", "小米粥", "菜包"]) {
    await search(page, query);
    await expect(current(page).locator(".empty-foods"), query).toBeVisible();
    await page.locator(".back-button").click();
    await expect(current(page).locator(".method-grid")).toBeVisible();
  }
});

test("home summary reflects the real weekly plan instead of a fixed number", async ({ page }) => {
  await openHome(page);
  await expect(page.locator(".weekly-split")).toContainText("未安排");
  await expect(page.locator(".weekly-split")).not.toContainText("68%");
});

test("backup export and import restore custom dishes", async ({ page }, testInfo) => {
  await openMyData(page);
  await page.locator(".custom-add-button").click();
  const inputs = page.locator(".custom-editor input");
  await inputs.nth(0).fill("备份测试卷饼");
  await inputs.nth(1).fill("Backup test wrap");
  await inputs.nth(2).fill("210");
  await inputs.nth(3).fill("150");
  await page.locator('.custom-editor button[type="submit"]').click();
  await expect(page.locator(".custom-row")).toHaveCount(1);

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".backup-export-button").click()]);
  expect(download.suggestedFilename()).toMatch(/^calorie-compass-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = testInfo.outputPath("backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  expect(backup.format).toBe("calorie-compass-backup");
  expect(backup.data.customFoods).toHaveLength(1);

  await page.evaluate(() => localStorage.clear());
  await openMyData(page);
  await expect(page.locator(".custom-row")).toHaveCount(0);

  await page.locator(".backup-file-input").setInputFiles(backupPath);
  await expect(page.locator(".backup-confirm")).toContainText("自定义菜品 1 道");
  await page.locator(".backup-confirm-button").click();
  await expect(page.locator(".custom-row")).toHaveCount(1);
  await expect(page.locator(".custom-row")).toContainText("备份测试卷饼");
  await expect(page.locator(".backup-status")).toContainText("导入完成");
});

test("files that are not backups are rejected without changing data", async ({ page }, testInfo) => {
  await openMyData(page);
  const notBackup = testInfo.outputPath("not-a-backup.json");
  fs.writeFileSync(notBackup, JSON.stringify({ hello: "world" }));
  await page.locator(".backup-file-input").setInputFiles(notBackup);
  await expect(page.locator(".backup-status.error")).toContainText("不是燃卡快查导出的备份文件");
  await expect(page.locator(".backup-confirm")).toHaveCount(0);
});
