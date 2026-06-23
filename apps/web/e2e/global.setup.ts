import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Initialises the Clerk testing token so the test browser bypasses bot
// detection. Runs once before the drill-down spec.
setup("global setup", async () => {
  await clerkSetup();
});
