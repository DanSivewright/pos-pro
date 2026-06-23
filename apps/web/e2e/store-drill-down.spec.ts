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

// The reference Stock Variance for the same Store and date: the alternative
// provider of the per-item stock-variance set.
const REFERENCE_STOCK_VARIANCE = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Stock_Variance_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
);

// The reference Stock Wastage for the same Store and date, contributing the
// day's waste cost.
const REFERENCE_STOCK_WASTAGE = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Stock_Wastage_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
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

test("uploads a Stock Variance and renders the top variances", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', REFERENCE_STOCK_VARIANCE);
  await expect(page.getByText(PARSED_TOAST).first()).toBeVisible();

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  await expect(page.getByTestId("top-variances").first()).toBeVisible();
});

test("a mixed batch shows per-file statuses and Store Day completeness", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', [
    REFERENCE_CASHUP,
    REFERENCE_ROYALTY,
    REFERENCE_GROSS_PROFIT,
  ]);

  // Three persistent per-file result rows, all parsed.
  await expect(page.getByTestId("upload-result")).toHaveCount(3);
  await expect(page.getByTestId("result-status").first()).toHaveText("parsed");

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  // The one Store Day shows Cashup, Royalty and GP as received.
  const completeness = page.getByTestId("completeness").first();
  await expect(completeness.getByTestId("report-cashup")).toHaveAttribute(
    "data-present",
    "true"
  );
  await expect(completeness.getByTestId("report-royalty")).toHaveAttribute(
    "data-present",
    "true"
  );
  await expect(completeness.getByTestId("report-grossProfit")).toHaveAttribute(
    "data-present",
    "true"
  );
});

test("the Control Tower shows the Store tile with its month-to-date net", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', REFERENCE_CASHUP);
  await expect(page.getByText(PARSED_TOAST)).toBeVisible();
  await page.reload();

  await expect(page.getByTestId("store-tile").first()).toBeVisible();
  await expect(page.getByTestId("tile-mtd-net").first()).toHaveText(
    "R12,571.00"
  );
});

test("uploads a Stock Wastage and renders the waste cost", async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto("/dashboard");
  await clerk.signIn({ page, emailAddress: userEmail });
  await page.reload();

  await page.setInputFiles('input[type="file"]', REFERENCE_STOCK_WASTAGE);
  await expect(page.getByText(PARSED_TOAST).first()).toBeVisible();

  await page.locator('a[href^="/dashboard/stores/"]').first().click();

  await expect(page.getByTestId("waste-cost").first()).toHaveText("R13.24");
});
