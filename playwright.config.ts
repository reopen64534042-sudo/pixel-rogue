import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "core-ui",
      testMatch: [
        "game.spec.ts",
        "d2b-acceptance.spec.ts",
        "performance.spec.ts",
        "original.spec.ts",
        "visual.spec.ts",
        "touch.spec.ts",
      ],
      use: { baseURL: "http://127.0.0.1:5174" },
    },
    {
      name: "production",
      testMatch: "release.spec.ts",
      use: { baseURL: "http://127.0.0.1:4173" },
    },
  ],
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort --mode e2e",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
  ],
});
