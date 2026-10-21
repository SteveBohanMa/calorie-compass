import { expect, test, type Page } from "@playwright/test";

// v2.8 food features: portion calculator, "use this data", favorites and comparison by portion.

function current(page: Page) {
  return page.getByTestId("flow-current");
}

async function openFood(page: Page, method: string, name: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".lookup-hero").click();
  await page.locator(".method-bubble", { hasText: method }).first().click();
  await current(page).locator(".food-row", { hasText: name }).first().click();
  await expect(current(page).locator(".portion-card")).toBeVisible();
}

async function todaysMeals(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("calorie-compass-v2.4-planner") ?? "{}");
    return Object.values(state.weeks ?? {}).flatMap((week: any) => week.days.flatMap((day: any) => day.meals));
  });
}

test("oden is counted per piece and the piece weight can be changed", async ({ page }) => {
  await openFood(page, "关东煮", "关东煮竹轮");
  const result = current(page).getByTestId("portion-result");
  await expect(result).toContainText("32"); // one 30 g piece at 107 kcal/100 g
  await current(page).locator("input[name=portion-amount]").fill("3");
  await expect(result.locator("strong")).toHaveText("96");
  await expect(result).toContainText("重量 90 g");
  await current(page).locator("input[name=portion-piece]").fill("40");
  await expect(result.locator("strong")).toHaveText("128");
  // Clearing a field while retyping never deletes the saved portion.
  await current(page).locator("input[name=portion-amount]").fill("");
  await expect(current(page).locator(".portion-invalid")).toBeVisible();
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-compass-v2.8-portions") ?? "{}"));
  expect(prefs).toMatchObject({ amounts: { "od-008": 3 }, pieceGrams: { "od-008": 40 } });
});

test("an oden piece weight goes with the meal into the weekly plan", async ({ page }) => {
  await openFood(page, "关东煮", "关东煮竹轮");
  await current(page).locator("input[name=portion-amount]").fill("2");
  await current(page).locator("input[name=portion-piece]").fill("40");
  await current(page).getByRole("button", { name: /使用此数据/ }).click();
  await current(page).getByRole("button", { name: "加入今天的饮食" }).click();
  const meals = await todaysMeals(page);
  expect(meals[0]).toMatchObject({ grams: 80, pieceGrams: 40 });
});

test("an oden meal keeps the default piece weight too, and huge portions cannot be added", async ({ page }) => {
  await openFood(page, "关东煮", "关东煮竹轮");
  await current(page).locator("input[name=portion-amount]").fill("2");
  await current(page).getByRole("button", { name: /使用此数据/ }).click();
  await current(page).getByRole("button", { name: "加入今天的饮食" }).click();
  expect((await todaysMeals(page))[0]).toMatchObject({ grams: 60, pieceGrams: 30 });
  await current(page).locator(".meal-added button").click();
  await current(page).locator("input[name=portion-amount]").fill("200");
  await expect(current(page).locator(".portion-invalid")).toContainText("一次最多记 3000 g");
  await expect(current(page).getByRole("button", { name: /使用此数据/ })).toBeDisabled();
});

test("use this data adds the portion to today's meals", async ({ page }) => {
  await openFood(page, "蒸", "米饭");
  await current(page).locator("input[name=portion-amount]").fill("200");
  await current(page).getByRole("button", { name: /使用此数据/ }).click();
  await current(page).getByRole("radio", { name: "午餐" }).click();
  await current(page).getByRole("button", { name: "加入今天的饮食" }).click();
  await expect(current(page).locator(".meal-added")).toContainText("已加入今天的午餐（200 g）");
  // The confirmation describes what was added, not what the calculator shows later.
  await current(page).locator("input[name=portion-amount]").fill("300");
  await expect(current(page).locator(".meal-added")).toContainText("（200 g）");
  const meals = await todaysMeals(page);
  expect(meals).toHaveLength(1);
  expect(meals[0]).toMatchObject({ slot: "lunch", grams: 200, completed: true });
  expect(meals[0].kcal).toBeCloseTo(meals[0].kcalPer100G * 2, 1);
});

test("favorites are saved and listed", async ({ page }) => {
  await openFood(page, "关东煮", "关东煮白萝卜");
  const heart = current(page).locator(".favorite-button");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-compass-v2.8-favorites") ?? "[]"))).toEqual(["f031"]);
  await page.reload();
  await page.locator(".round-tool[aria-label=收藏]").click();
  await expect(current(page).locator(".food-row")).toHaveCount(1);
  await current(page).locator(".food-row").click();
  await current(page).locator(".favorite-button").click();
  await page.locator(".back-button").click();
  await expect(current(page).locator(".favorites-empty")).toBeVisible();
});

test("comparison can switch from per 100 g to real portions", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("calorie-compass-v2.5-compare-foods", JSON.stringify(["f001", "f031"]));
  });
  await page.reload();
  await page.locator(".round-tool[aria-label=热量对比]").click();
  const rows = current(page).getByTestId("compare-row");
  await expect(rows).toHaveCount(2);
  const per100 = await rows.locator("em").allTextContents();
  await current(page).getByRole("radio", { name: "按实际份量" }).click();
  await expect(rows.first().locator("input")).toHaveValue("150");
  await expect(rows.nth(1).locator("input")).toHaveValue("1");
  const portion = await rows.locator("em").allTextContents();
  expect(portion).not.toEqual(per100);
  await rows.nth(1).locator("input").fill("4");
  await expect(rows.nth(1)).toContainText("≈ 280 g");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-compass-v2.8-portions") ?? "{}"));
  expect(stored).toMatchObject({ compareMode: "portion", amounts: { f031: 4 } });
  // An empty amount hides that row's number and bar instead of showing a stale value.
  await rows.nth(1).locator("input").fill("");
  await expect(rows.nth(1)).toHaveAttribute("data-invalid", "true");
  await expect(rows.nth(1).locator("em")).toHaveText("请填写份量");
  await expect(rows.nth(1).locator("i.empty")).toBeVisible();
  await expect(rows.nth(1)).not.toContainText("≈");
  await expect(rows.first()).not.toHaveAttribute("data-invalid", "true");
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-compass-v2.8-portions") ?? "{}"));
  expect(kept.amounts.f031).toBe(4);
});
