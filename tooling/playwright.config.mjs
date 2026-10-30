import { defineConfig, devices } from "@playwright/test";

// One shared in-memory mock backend, so tests run serially to keep its order log deterministic.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }], ["json", { outputFile: "pw-results.json" }]] : "list",
  // PW_CHANNEL=chrome reuses an installed Chrome when the pinned Playwright browser is not downloaded (local runs).
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure", ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  webServer: { command: "node serve.mjs", url: "http://127.0.0.1:4173/__mock/log", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
