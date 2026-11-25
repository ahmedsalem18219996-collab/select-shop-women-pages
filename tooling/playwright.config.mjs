import { defineConfig, devices } from "@playwright/test";

const webkitAdmin = process.env.WEBKIT_ADMIN === "1";
const webkit = webkitAdmin ? {
  testMatch: /(?:admin-landing-studio|admin-order-followup|admin-ad-tracking|image-upload-compat)\.spec\.mjs$/,
} : {
  testMatch: "**/landing-studio.spec.mjs",
  grep: /campaign-linked landing pages show the other models and share one COD bag/,
};

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
    // CI covers the customer campaign checkout. WEBKIT_ADMIN=1 selects the manual suites.
    ...(process.env.PW_WEBKIT === "1" || webkitAdmin ? [
      { name: "webkit-mobile", ...webkit, use: { ...devices["iPhone 13"], browserName: "webkit" } },
      { name: "webkit-desktop", ...webkit, use: { ...devices["Desktop Safari"], browserName: "webkit" } },
    ] : []),
  ],
});
