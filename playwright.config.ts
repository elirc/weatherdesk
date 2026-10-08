import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a seeded mock-mode app. The orchestrator starts web+worker
 * before running; webServer below starts the web app if it is not already up.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 1,
  workers: 1, // low-RAM box; serial
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // most visitors are on Android phones — run the core flows mobile-sized
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
