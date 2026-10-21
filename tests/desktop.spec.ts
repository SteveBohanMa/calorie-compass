import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Desktop checks against the built app (`npm run test:desktop` builds first).
// ELECTRON_PATH can point at a different Electron binary when needed.

const appDir = path.resolve(fileURLToPath(new URL("..", import.meta.url))); // no trailing separator
const extraArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

async function launch(profile: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: process.env.ELECTRON_PATH || undefined,
    args: [...extraArgs, appDir],
    env: { ...process.env, CALORIE_COMPASS_USER_DATA_DIR: profile },
  });
}

async function firstReadyWindow(app: ElectronApplication) {
  const page = await app.firstWindow();
  await expect(page.locator(".lookup-hero")).toBeVisible({ timeout: 15_000 });
  return page;
}

test.beforeAll(() => {
  if (!fs.existsSync(path.join(appDir, "dist", "client", "index.html"))) {
    throw new Error("Build the app first: npm run build");
  }
});

test("user data survives a restart because the origin is fixed", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-compass-test-"));
  try {
    const first = await launch(profile);
    const page = await firstReadyWindow(first);
    expect(await page.evaluate(() => location.origin)).toBe("app://calorie-compass");
    await page.evaluate(() => localStorage.setItem("calorie-compass-restart-probe", "kept"));
    await first.close();

    const second = await launch(profile);
    const again = await firstReadyWindow(second);
    expect(await again.evaluate(() => location.origin)).toBe("app://calorie-compass");
    expect(await again.evaluate(() => localStorage.getItem("calorie-compass-restart-probe"))).toBe("kept");
    await second.close();
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("the app protocol only serves files inside the app", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-compass-test-"));
  const app = await launch(profile);
  try {
    const page = await firstReadyWindow(app);
    const statuses = await page.evaluate(async () => {
      const status = async (url: string) => (await fetch(url)).status;
      return {
        // Encoded separators reach the handler undecoded, so these exercise the path guard.
        traversal: await status("/..%2f..%2fpackage.json"),
        backslashTraversal: await status("/..%5c..%5cpackage.json"),
        missingImage: await status("/assets/food/does-not-exist.jpg"),
        appRoute: await status("/some/app/route"),
        catalogImage: await status("/assets/food/catalog/f001.jpg"),
      };
    });
    expect(statuses).toEqual({ traversal: 404, backslashTraversal: 404, missingImage: 404, appRoute: 200, catalogImage: 200 });
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("startup has no console errors and the desktop bridges are present", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-compass-test-"));
  const app = await launch(profile);
  try {
    const page = await firstReadyWindow(app);
    const problems: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
    page.on("pageerror", (error) => problems.push(error.message));
    // Load the app again with the listeners attached so startup messages are captured too.
    await page.goto("app://calorie-compass/");
    await expect(page.locator(".lookup-hero")).toBeVisible({ timeout: 15_000 });
    const bridges = await page.evaluate(() => ({
      report: typeof window.calorieCompass?.exportReport,
      backup: typeof window.calorieCompass?.exportBackup,
    }));
    expect(bridges).toEqual({ report: "function", backup: "function" });
    expect(problems).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
