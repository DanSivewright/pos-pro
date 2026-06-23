import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests live beside source. Playwright specs in e2e/ are run by
    // `playwright test`, not vitest.
    include: ["src/**/*.test.ts"],
  },
});
