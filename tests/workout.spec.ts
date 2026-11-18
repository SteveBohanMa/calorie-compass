import { expect, test, type Page } from "@playwright/test";

// UI checks for the v2.8 workout estimator. Runs against the Vite dev server from playwright.config.ts.

const PROFILE_KEY = "calorie-compass-v2.8-profile";
const PLANNER_KEY = "calorie-compass-v2.4-planner";
const sampleUser = { sex: "male", birthYear: new Date().getFullYear() - 25, heightCm: 178, weightKg: 112, activityRating: null, vo2max: null, hrMax: null, updatedAt: "" };

function current(page: Page) {
  return page.getByTestId("flow-current");
}

async function openWorkout(page: Page, profile: object | null = sampleUser) {
  await page.goto("/");
  await page.evaluate(([key, value]) => {
    localStorage.clear();
    if (value) localStorage.setItem(key, value);
  }, [PROFILE_KEY, profile ? JSON.stringify(profile) : ""] as const);
  await page.reload();
  await page.locator(".feature-card", { hasText: "训练估算" }).click();
  await expect(current(page).locator(".wk-card")).toBeVisible();
}

async function fill(page: Page, name: string, value: string) {
  await current(page).locator(`.wk-card input[name=${name}]`).fill(value);
}

test("the estimator asks for body data first and remembers it", async ({ page }) => {
  await openWorkout(page, null);
  await expect(current(page).locator(".wk-profile-form")).toBeVisible();
  await expect(current(page).getByTestId("workout-result")).toHaveCount(0);
  await current(page).getByRole("radio", { name: "男" }).click();
  await current(page).locator("input[name=age]").fill("25");
  await current(page).locator("input[name=height]").fill("178");
  await current(page).locator("input[name=weight]").fill("112");
  await current(page).locator(".wk-save").click();
  await expect(current(page).locator(".wk-profile")).toContainText("男 · 25 岁 · 178 cm · 112 kg");
  await expect(current(page).getByTestId("workout-result")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROFILE_KEY);
  expect(stored).toMatchObject({ sex: "male", heightCm: 178, weightKg: 112 });
  await page.reload();
  await page.locator(".feature-card", { hasText: "训练估算" }).click();
  await expect(current(page).locator(".wk-profile")).toContainText("112 kg");
});

test("deadlift 150 kg × 10 for a 112 kg man reads 12–43 kcal, training part only", async ({ page }) => {
  await openWorkout(page);
  await fill(page, "load", "150");
  await fill(page, "sets", "1");
  await fill(page, "reps", "10");
  const result = current(page).getByTestId("workout-result");
  await expect(result.locator(".wk-result-label")).toHaveText("本次训练消耗（训练部分）");
  await expect(result.locator(".wk-result-value")).toContainText("12–43");
  await expect(result.locator("[data-component=resting]")).toContainText("未计入");
  await expect(result.locator(".wk-notes")).toContainText("未计入静息代谢");
  // The calculation shows how the 30-s set is split in time.
  await result.getByRole("button", { name: "计算依据" }).click();
  await expect(result.locator(".wk-basis")).toContainText("每组约 30 秒");
  await expect(result.locator(".wk-basis")).toContainText("约 24% 的额外消耗发生在组内");
  await expect(result.locator(".wk-basis")).toContainText("并不是精确的统计区间");
});

test("an invalid value keeps the last result dimmed and says what to fix", async ({ page }) => {
  await openWorkout(page);
  const result = current(page).getByTestId("workout-result");
  const before = await result.locator(".wk-result-value").textContent();
  await result.getByRole("button", { name: "计算依据" }).click();
  await fill(page, "reps", "2.5");
  await expect(current(page).locator(".wk-incomplete")).toContainText("次数 1–100 的整数");
  await expect(current(page).locator(".wk-card label.invalid input[name=reps]")).toBeVisible();
  await expect(result).toHaveAttribute("data-stale", "true");
  await expect(result.locator(".wk-result-value")).toHaveText(before ?? "");
  await expect(result.locator(".wk-add")).toHaveCount(0);
  // The calculation stays open while the value is fixed.
  await expect(result.locator(".wk-basis")).toBeVisible();
  await fill(page, "reps", "12");
  await expect(result).not.toHaveAttribute("data-stale", "true");
  await expect(result.locator(".wk-add")).toBeVisible();
  await expect(result.locator(".wk-basis")).toBeVisible();
  await expect(current(page).locator(".wk-incomplete")).toHaveCount(0);
});

test("heart rate without rest corrects the work during sets over the typical rest", async ({ page }) => {
  await openWorkout(page);
  await fill(page, "load", "150");
  await fill(page, "sets", "5");
  await fill(page, "reps", "10");
  await current(page).locator(".wk-advanced-toggle").click();
  await fill(page, "hr", "140");
  const result = current(page).getByTestId("workout-result");
  await expect(result.locator("[data-note=hr-assumed-rest]")).toContainText("常见的组间休息（120 秒）");
  await expect(result.locator(".wk-notes")).toContainText("Collins 1991");
  await expect(result.locator(".wk-result-label")).toHaveText("本次训练消耗（训练部分）");
  await fill(page, "hr", "210");
  await expect(result.locator("[data-note=hr-above-max]")).toBeVisible();
});

test("entering rest adds rest recovery and resting metabolism", async ({ page }) => {
  await openWorkout(page);
  await fill(page, "load", "150");
  await fill(page, "sets", "5");
  await fill(page, "reps", "10");
  const result = current(page).getByTestId("workout-result");
  await expect(result.locator("[data-component=between]")).toContainText("未计入");
  await expect(result.locator("[data-note=between-excluded]")).toContainText(/未计入组间恢复（约 \d+–\d+ kcal）/);
  await current(page).locator(".wk-advanced-toggle").click();
  await fill(page, "rest", "120");
  await expect(result.locator(".wk-result-label")).toHaveText("本次训练总消耗（含静息代谢）");
  await expect(result.locator("[data-component=between]")).toContainText("kcal");
  await expect(result.locator("[data-component=resting]")).toContainText("静息代谢（11 分钟）");
  await expect(result.locator(".wk-facts")).toContainText("其中训练额外消耗");
  await fill(page, "hr", "140");
  await expect(result.locator(".wk-notes")).toContainText("Collins 1991");
});

test("RPE picks the intensity of resistance-type sessions, and the form says so", async ({ page }) => {
  await openWorkout(page);
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-picker input").fill("循环");
  await current(page).locator(".wk-picker-list button").first().click();
  const levels = current(page).locator(".wk-level button");
  await expect(levels.first()).toBeEnabled();
  await current(page).locator(".wk-advanced-toggle").click();
  await fill(page, "rpe", "8");
  await expect(levels.first()).toBeDisabled();
  await expect(current(page).locator(".wk-level button.active")).toHaveCount(1);
  await expect(current(page).locator(".wk-level-note")).toContainText("已按 RPE 8 选择");
  await fill(page, "rpe", "");
  await expect(levels.first()).toBeEnabled();
});

test("planks count resting metabolism only when the rest is entered", async ({ page }) => {
  await openWorkout(page);
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-picker input").fill("平板支撑");
  await current(page).locator(".wk-picker-list button").first().click();
  const result = current(page).getByTestId("workout-result");
  await expect(result.locator(".wk-result-label")).toHaveText("本次训练消耗（训练部分）");
  await expect(result.locator("[data-component=resting]")).toContainText("未计入");
  await expect(result.locator("[data-component=epoc]")).toContainText("<1 kcal");
  await current(page).locator(".wk-advanced-toggle").click();
  await fill(page, "rest", "30");
  await expect(result.locator(".wk-result-label")).toHaveText("本次训练总消耗（含静息代谢）");
  await expect(result.locator("[data-component=resting]")).toContainText("静息代谢（3.0 分钟）");
});

test("a set without work cannot be added to the plan", async ({ page }) => {
  await openWorkout(page);
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-picker input").fill("高位下拉");
  await current(page).locator(".wk-picker-list button").first().click();
  await fill(page, "load", "0");
  const result = current(page).getByTestId("workout-result");
  await expect(result.locator("[data-note=no-work]")).toBeVisible();
  await expect(result.locator(".wk-add")).toHaveCount(0);
});

test("a profile without sex says so instead of showing the option label", async ({ page }) => {
  await openWorkout(page, { ...sampleUser, sex: "unspecified" });
  await expect(current(page).locator(".wk-profile")).toContainText("性别未填 · 25 岁");
});

test("the picker filters by name, body part and equipment", async ({ page }) => {
  await openWorkout(page);
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-picker input").fill("下拉");
  await current(page).locator(".wk-picker-list button", { hasText: "高位下拉" }).click();
  await expect(current(page).locator(".wk-exercise strong")).toHaveText("高位下拉");
  await expect(current(page).locator(".wk-card")).toContainText("配重片读数");
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-chips button", { hasText: "有氧" }).first().click();
  const names = await current(page).locator(".wk-picker-list strong").allTextContents();
  expect(names).toContain("快走 / 坡度走");
  expect(names).not.toContain("高位下拉");
  await current(page).locator(".wk-picker-list button", { hasText: "快走 / 坡度走" }).click();
  await fill(page, "grade", "10");
  await expect(current(page).getByTestId("workout-result").locator("[data-component=exercise]")).toContainText("kcal");
  // Choosing the same exercise again keeps what was typed.
  await current(page).locator(".wk-change").click();
  await current(page).locator(".wk-picker-list button", { hasText: "快走 / 坡度走" }).click();
  await expect(current(page).locator(".wk-card input[name=grade]")).toHaveValue("10");
});

test("an estimate can be added to today's plan and shows in the weekly report", async ({ page }) => {
  await openWorkout(page);
  await current(page).getByRole("button", { name: "加入今天的训练计划" }).click();
  await expect(current(page).locator(".wk-status")).toContainText("已加入");
  const workouts = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? "{}");
    return Object.values(state.weeks ?? {}).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts));
  }, PLANNER_KEY);
  expect(workouts).toHaveLength(1);
  expect(workouts[0]).toMatchObject({ exerciseId: "deadlift", modelVersion: 2, bodyWeight: 112 });
  await page.locator(".back-button").click();
  await page.locator(".weekly-card").click();
  await expect(current(page).locator(".report-stats")).toContainText("训练额外消耗");
  const burn = await current(page).locator(".report-stats strong").nth(1).textContent();
  expect(Number((burn ?? "0").replace(/,/g, ""))).toBeGreaterThan(0);
});

test("old placeholder workouts are cleared and the editor uses body data", async ({ page }) => {
  await page.goto("/");
  const monday = await page.evaluate(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  });
  await page.evaluate(([plannerKey, profileKey, profile, week]) => {
    localStorage.clear();
    localStorage.setItem(profileKey, profile);
    localStorage.setItem(plannerKey, JSON.stringify({ version: 1, weeks: { [week]: { weekStart: week, updatedAt: "x", days: [{ date: week, meals: [], workouts: [{ id: "old", exerciseId: "deadlift", nameZh: "硬拉", nameEn: "Deadlift", bodyWeight: 70, sets: 4, reps: 8, loadKg: 80, durationMinutes: 0, burnLow: 50, burnHigh: 60, completed: true }] }] } } }));
  }, [PLANNER_KEY, PROFILE_KEY, JSON.stringify(sampleUser), monday] as const);
  await page.reload();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PLANNER_KEY);
  const remaining = Object.values(stored.weeks).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts));
  expect(remaining).toEqual([]);
  await page.locator(".weekly-card").click();
  await current(page).getByRole("button", { name: /编辑训练动作/ }).click();
  await current(page).getByRole("button", { name: "添加训练动作" }).click();
  const card = current(page).getByTestId("workout-entry");
  await expect(card.locator("input[type=number]").first()).toHaveValue("112");
  await card.locator("input[name=load]").fill("150");
  await expect(card.locator(".wk-entry-result")).toContainText("kcal");
});

async function seedPlan(page: Page, workouts: object[]) {
  await page.goto("/");
  const monday = await page.evaluate(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  });
  await page.evaluate(([plannerKey, profileKey, profile, week, entries]) => {
    localStorage.clear();
    localStorage.setItem(profileKey, profile);
    localStorage.setItem(plannerKey, JSON.stringify({ version: 1, weeks: { [week]: { weekStart: week, updatedAt: "x", days: [{ date: week, meals: [], workouts: JSON.parse(entries) }] } } }));
  }, [PLANNER_KEY, PROFILE_KEY, JSON.stringify(sampleUser), monday, JSON.stringify(workouts)] as const);
  await page.reload();
  await page.locator(".weekly-card").click();
  // Monday is the first day button.
  await current(page).locator(".day-strip button, .day-tabs button").first().click().catch(() => undefined);
  await current(page).getByRole("button", { name: /编辑训练动作/ }).click();
}

const savedEntry = {
  id: "w1", exerciseId: "deadlift", nameZh: "传统硬拉", nameEn: "Conventional deadlift", bodyWeight: 112, sets: 1, reps: 10, loadKg: 150,
  restSec: null, secPerRep: null, holdSeconds: null, minutes: null, speedKmh: null, gradePct: null, watts: null, level: null, rpe: null, avgHr: null,
  durationMinutes: 0.5, burnLow: 12, burnMid: 23, burnHigh: 43, totalLow: null, totalHigh: null, headline: "training", modelVersion: 2, completed: false,
};

test("plan entries show when their numbers are not updated yet", async ({ page }) => {
  await seedPlan(page, [savedEntry]);
  const card = current(page).getByTestId("workout-entry");
  await expect(card.locator(".wk-entry-result strong")).toHaveText("12–43 kcal");
  await card.locator("input[type=number]").first().fill("500");
  await expect(card.locator(".wk-stale-badge")).toHaveText("未更新");
  await expect(card.locator("label.invalid")).toHaveCount(1);
  await card.locator("input[type=number]").first().fill("100");
  await expect(card.locator(".wk-stale-badge")).toHaveCount(0);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PLANNER_KEY);
  const entry = Object.values(stored.weeks).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts))[0] as { bodyWeight: number };
  expect(entry.bodyWeight).toBe(100);
});

test("retired exercises and entries from a newer version are not recalculated", async ({ page }) => {
  const retired = { ...savedEntry, id: "w-retired", exerciseId: "retired-machine", nameZh: "旧器械", nameEn: "Old machine" };
  const newer = { id: "w-newer", exerciseId: "deadlift-v3", nameZh: "新版硬拉", nameEn: "Deadlift v3", burnLow: 20, burnMid: 30, burnHigh: 45, modelVersion: 3, completed: false, phases: [1, 2] };
  await seedPlan(page, [retired, newer]);
  const cards = current(page).getByTestId("workout-entry");
  await expect(cards).toHaveCount(2);
  const retiredCard = cards.first();
  await expect(retiredCard.locator("select option:checked")).toContainText("旧器械（已下架，请重新选择）");
  await expect(retiredCard.locator(".wk-entry-result strong")).toHaveText("12–43 kcal");
  await expect(retiredCard.locator("input[name=load]")).toHaveCount(0);
  const readOnly = cards.nth(1);
  await expect(readOnly).toHaveAttribute("data-readonly", "true");
  await expect(readOnly).toContainText("更新版本");
  await readOnly.locator(".check-control").click();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PLANNER_KEY);
  const entries = Object.values(stored.weeks).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts)) as any[];
  // Ticking only changes the done state (and stamps when, for Health Connect write-back in v2.10).
  expect(entries.find((entry) => entry.id === "w-newer")).toEqual({ ...newer, completed: true, completedAt: expect.any(String) });
  expect(entries.find((entry) => entry.id === "w-retired").exerciseId).toBe("retired-machine");
  // Picking a real exercise turns the retired entry into a normal one.
  await retiredCard.locator("select").selectOption("squat");
  await expect(retiredCard.locator("input[name=load]")).toBeVisible();
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PLANNER_KEY);
  const changed = (Object.values(after.weeks).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts)) as any[]).find((entry) => entry.id === "w-retired");
  expect(changed.exerciseId).toBe("squat");
});
