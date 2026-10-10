import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.mjs",
  outputDir: ".cache/playwright-results",
  use: { baseURL: process.env.PLANTER_TEST_URL || "http://localhost:3100", channel: "chrome", headless: true },
});
