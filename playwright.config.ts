import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a seeded mock-mode app. Port is NOT 3000 by default:
 * other apps may hold it on shared dev boxes. BETTER_AUTH_URL must match the
 * served origin or sign-in fails with INVALID_ORIGIN, so the webServer env
 * pins all origin vars to the chosen port.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 1,
  workers: 1, // low-RAM box; serial
  reporter: [["list"]],
  use: {
    baseURL: BASE,
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
    command: `pnpm dev -p ${PORT}`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      ...process.env,
      APP_URL: BASE,
      BETTER_AUTH_URL: BASE,
      NEXT_PUBLIC_APP_URL: BASE,
      AUTH_MOCK: "true",
    },
  },
});
