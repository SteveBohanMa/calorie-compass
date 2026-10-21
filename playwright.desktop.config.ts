import { defineConfig } from "@playwright/test";

// Electron checks. Run with `npm run test:desktop` (builds the app first).
export default defineConfig({
  testDir: "./tests",
  testMatch: "desktop.spec.ts",
  timeout: 60_000,
  workers: 1,
});
