import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { createAndroidDesktopApi, createBackController, safeFileName, type NativeFilesPlugin } from "../src/native/bridge";

// v2.9 Android app: the platform glue in src/native/bridge.ts, and the app at the size of a phone
// (412 x 915 CSS pixels, like a Galaxy S24 Ultra at its default resolution) with touch input.
// The phone tests save screenshots to verification-v29-android/ for a visual check.

const SHOTS = "verification-v29-android";
const PROFILE_KEY = "calorie-compass-v2.8-profile";
const sampleUser = { sex: "male", birthYear: new Date().getFullYear() - 25, heightCm: 178, weightKg: 112, activityRating: null, vo2max: null, hrMax: null, updatedAt: "" };

test.describe("Android back button", () => {
  test("closes what is open first, then goes back a screen, then leaves the app", () => {
    const back = createBackController();
    let exits = 0;
    let pops = 0;
    let closed = 0;
    back.setExit(() => {
      exits += 1;
    });
    back.setFlow({ canGoBack: true, pop: () => { pops += 1; } });
    const release = back.pushOverlay(() => {
      closed += 1;
    });
    expect(back.handleBack()).toBe("overlay");
    expect([closed, pops, exits]).toEqual([1, 0, 0]);
    release();
    expect(back.handleBack()).toBe("pop");
    expect([closed, pops, exits]).toEqual([1, 1, 0]);
    back.setFlow({ canGoBack: false, pop: () => { throw new Error("the home screen cannot go back"); } });
    expect(back.handleBack()).toBe("exit");
    expect([closed, pops, exits]).toEqual([1, 1, 1]);
  });

  test("an overlay left open on a screen further down the stack does not catch the back button", () => {
    const back = createBackController();
    let pops = 0;
    let closedBelow = 0;
    back.setFlow({ canGoBack: true, pop: () => { pops += 1; } });
    back.pushOverlay(() => { closedBelow += 1; }, () => false);
    expect(back.handleBack()).toBe("pop");
    expect([closedBelow, pops]).toEqual([0, 1]);
  });
});

test.describe("Android file export", () => {
  test("keeps the Windows result shape and passes CSS pixels with the pixel ratio", async () => {
    const calls: unknown[] = [];
    const plugin: NativeFilesPlugin = {
      saveBackup: async (options) => {
        calls.push(["backup", options]);
        return { saved: true, canceled: false, filePath: "Download/燃卡快查/燃卡快查-数据备份-2026-11-01.json" };
      },
      saveReport: async (options) => {
        calls.push(["report", options]);
        return { saved: true, canceled: false, filePath: "Pictures/燃卡快查/燃卡快查-周报-2026-10-26.png" };
      },
    };
    const api = createAndroidDesktopApi(plugin, () => 2.625);
    await expect(api.exportBackup!("{}", "燃卡快查-数据备份-2026-11-01.json")).resolves.toEqual({
      saved: true,
      canceled: false,
      filePath: "Download/燃卡快查/燃卡快查-数据备份-2026-11-01.json",
    });
    await expect(api.exportReport({ x: 16.4, y: 220, width: 380, height: 412.5 }, "燃卡快查-周报-2026-10-26.png")).resolves.toMatchObject({ saved: true });
    expect(calls).toEqual([
      ["backup", { json: "{}", fileName: "燃卡快查-数据备份-2026-11-01.json" }],
      ["report", { x: 16.4, y: 220, width: 380, height: 412.5, scale: 2.625, fileName: "燃卡快查-周报-2026-10-26.png" }],
    ]);
  });

  test("reports failures like the Windows app instead of throwing", async () => {
    const plugin: NativeFilesPlugin = {
      saveBackup: async () => {
        throw new Error("storage full");
      },
      saveReport: async () => ({ saved: false, canceled: false, error: "Screen copy failed (1)" }),
    };
    const api = createAndroidDesktopApi(plugin, () => Number.NaN);
    await expect(api.exportBackup!("{}", "backup.json")).resolves.toEqual({ saved: false, canceled: false, error: "storage full" });
    await expect(api.exportReport({ x: 0, y: 0, width: 10, height: 10 }, "report.png")).resolves.toEqual({ saved: false, canceled: false, error: "Screen copy failed (1)" });
  });

  test("file names lose path separators and keep their extension", () => {
    expect(safeFileName("燃卡快查-周报-2026-10-26.png", "png")).toBe("燃卡快查-周报-2026-10-26.png");
    expect(safeFileName("../a/b:c", "json")).toBe("-a-b-c.json");
    expect(safeFileName("report.PNG", "png")).toBe("report.PNG");
    expect(safeFileName("", "png")).toBe("calorie-compass.png");
  });
});

// ---------------------------------------------------------------- the app on a phone screen

function current(page: Page) {
  return page.getByTestId("flow-current");
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500); // let the screen transition finish
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Nothing on the current screen is wider than the phone (it would be cut off: pages only scroll up and down). */
async function expectFitsWidth(page: Page, screen: string) {
  const overflow = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="flow-current"] [data-testid="mobile-scroll"]');
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      content: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
    };
  });
  expect(overflow.page, `${screen}: page wider than the phone`).toBeLessThanOrEqual(0);
  expect(overflow.content, `${screen}: content wider than the phone`).toBeLessThanOrEqual(1);
}

async function swipe(page: Page, x: number, fromY: number, toY: number) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: fromY }] });
  for (let index = 1; index <= 10; index += 1) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: fromY + ((toY - fromY) * index) / 10 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

async function openFresh(page: Page, profile: object | null = null) {
  await page.goto("/");
  await page.evaluate(([key, value]) => {
    localStorage.clear();
    if (value) localStorage.setItem(key, value);
  }, [PROFILE_KEY, profile ? JSON.stringify(profile) : ""] as const);
  await page.reload();
  await expect(page.locator(".lookup-hero")).toBeVisible();
}

async function back(page: Page) {
  await page.locator(".back-button").tap();
  await expect(page.locator(".lookup-hero")).toBeVisible();
}

// On a phone everything is tapped: with touch emulation on, Chromium does not turn Playwright's mouse
// clicks into clicks on these screens, so the phone tests use tap() throughout.
test.describe("phone screen", () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("lookup works with touch: taps open screens and drags scroll the list", async ({ page }) => {
    await openFresh(page);
    await expectFitsWidth(page, "home");
    const nav = await page.locator(".main-nav").boundingBox();
    expect(nav && nav.y + nav.height).toBeLessThanOrEqual(915);
    await shot(page, "01-home");

    await page.locator(".lookup-hero").tap();
    await expect(current(page).locator(".method-grid")).toBeVisible();
    await expectFitsWidth(page, "lookup");
    await shot(page, "02-lookup");

    await current(page).locator(".method-bubble", { hasText: "关东煮" }).first().tap();
    await expect(current(page).locator(".food-row").first()).toBeVisible();
    await expectFitsWidth(page, "oden list");
    await shot(page, "03-oden-list");

    const list = current(page).getByTestId("mobile-scroll");
    await swipe(page, 206, 760, 260);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    // A flick keeps gliding for a few seconds and may bounce at the end; tap only once it rests.
    await expect.poll(async () => {
      const before = await list.evaluate((element) => `${element.scrollTop}/${element.dataset.overscroll}`);
      await page.waitForTimeout(300);
      const after = await list.evaluate((element) => `${element.scrollTop}/${element.dataset.overscroll}`);
      return before === after && after.endsWith("/0.00");
    }, { timeout: 10_000 }).toBe(true);
    await shot(page, "04-oden-list-scrolled");

    await current(page).locator(".food-row").nth(3).tap();
    await expect(current(page).locator(".macro-card")).toBeVisible();
    await expectFitsWidth(page, "food detail");
    await shot(page, "05-food-detail");
  });

  test("the other screens fit the phone", async ({ page }) => {
    await openFresh(page, sampleUser);

    await page.locator(".feature-card", { hasText: "训练估算" }).tap();
    await expect(current(page).locator(".wk-card")).toBeVisible();
    await expectFitsWidth(page, "workout");
    await shot(page, "06-workout");
    await back(page);

    await page.locator(".weekly-card").tap();
    await expect(current(page).locator(".plan-page")).toBeVisible();
    await expectFitsWidth(page, "weekly plan");
    await shot(page, "07-plan");
    await back(page);

    await page.getByRole("button", { name: "热量对比" }).first().tap();
    await expect(page.locator(".app-header")).toContainText("热量对比");
    await expectFitsWidth(page, "compare");
    await shot(page, "08-compare");
    await back(page);

    await page.getByRole("button", { name: "我的数据" }).first().tap();
    await expect(current(page).locator(".backup-card")).toBeVisible();
    await expectFitsWidth(page, "my data");
    await shot(page, "09-my-data");
    await back(page);

    await page.locator(".feature-card", { hasText: "单位换算" }).tap();
    await expect(page.locator(".app-header")).toContainText("单位换算");
    await expectFitsWidth(page, "converter");
    await shot(page, "10-converter");
  });

  test("in the Android app the bottom navigation sits just above Android's own navigation bar", async ({ page }) => {
    await openFresh(page);
    // src/native/android.ts sets this attribute in the Android app; the web build stays as it is.
    await page.evaluate(() => {
      document.documentElement.dataset.nativePlatform = "android";
    });
    // 6 px under the footer plus the bar's own 12 px margin (the footer slides there in 260 ms); the
    // Windows layout keeps 34 px for an iPhone home indicator.
    const gapBelowNav = async () => {
      const nav = await page.locator(".main-nav").boundingBox();
      return nav ? 915 - (nav.y + nav.height) : Number.POSITIVE_INFINITY;
    };
    await expect.poll(gapBelowNav).toBeLessThanOrEqual(20);
    expect(await gapBelowNav()).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(245, 252, 248)");
    await shot(page, "00-home-android");
  });
});
