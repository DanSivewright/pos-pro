import { join } from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// The same reference Cashup the parser fixture uses. Uploading it drives the
// real tracer bullet (parse -> ingest -> drill-down), so the test seeds its own
// Store Day rather than depending on pre-existing data.
const REFERENCE_CASHUP = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Store_Cashup_From_07-06-2026_Printed_On_07-06-2026.pdf"
);

// The reference Royalty for the same Store and date, so it merges onto the one
// Store Day created by the Cashup above.
const REFERENCE_ROYALTY = join(
  process.cwd(),
  "../../docs/reference/rp-first-batch/Royalty_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
);

// The reference Gross Profit for the same Store and date, contributing GP%/FC%
// and the per-item stock-variance set to that one Store Day.
const REFERENCE_GROSS_PROFIT = join(
  process.cwd(),
  "../../docs/reference/rp-first-batch/Gross_Profit_From_07-06-2026_To_07-06-2026_Printed_On_08-06-2026.pdf"
);

// Provided by the runner. The user must belong to exactly one Clerk
// Organization so that org becomes the active Store on sign-in.
const userEmail = process.env.E2E_CLERK_USER_EMAIL ?? "";

const PARSED_TOAST = /parsed/i;

test("uploads a Cashup and renders net sales and cash variance", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', REFERENCE_CASHUP);
  await expect(page.getByText(PARSED_TOAST)).toBeVisible();

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  await expect(page.getByTestId("net-sales").first()).toHaveText("R12,571.00");
  await expect(page.getByTestId("cash-variance").first()).toHaveText(
    "-R145.50"
  );
});

test("uploads a Royalty and renders royalty due and the channel mix", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', [
    REFERENCE_CASHUP,
    REFERENCE_ROYALTY,
  ]);
  await expect(page.getByText(PARSED_TOAST).first()).toBeVisible();

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  await expect(page.getByTestId("royalty-due").first()).toHaveText("R1,005.68");
  await expect(page.getByTestId("channel-mix").first()).toBeVisible();
});

test("uploads a Gross Profit and renders GP%/FC% and the top variances", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', [
    REFERENCE_CASHUP,
    REFERENCE_GROSS_PROFIT,
  ]);
  await expect(page.getByText(PARSED_TOAST).first()).toBeVisible();

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  await expect(page.getByTestId("gp-percent").first()).toHaveText("57.21%");
  await expect(page.getByTestId("fc-percent").first()).toHaveText("42.79%");
  await expect(page.getByTestId("top-variances").first()).toBeVisible();
});
