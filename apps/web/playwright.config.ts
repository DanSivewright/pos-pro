import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Playwright needs the Clerk keys that the app reads from .env.
config({ path: ".env" });

const PORT = process.env.PORT ?? "3001";
const baseURL = `http://localhost:${PORT}`;
const WEB_SERVER_TIMEOUT_MS = 120_000;

// One spec, two viewports: the drill-down must render correctly on desktop and
// mobile. Both projects depend on the Clerk global setup.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: process.env.CI === undefined,
    timeout: WEB_SERVER_TIMEOUT_MS,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: "global.setup.ts",
    },
    {
      name: "desktop",
      testMatch: "**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: "**/*.spec.ts",
      use: { ...devices["Pixel 5"] },
      dependencies: ["setup"],
    },
  ],
});
