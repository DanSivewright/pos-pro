/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// A Cashup extract whose deductions reconcile, so net sales = the value passed
// and the day is never flagged for review (irrelevant to the rollup).
function cashupExtract(date: string, netSales: number) {
  return {
    date,
    grossSales: netSales,
    discounts: 0,
    refunds: 0,
    voids: 0,
    netSales,
    tips: 0,
    cashVariance: 0,
    cardVariance: 0,
  };
}

function grossProfitExtract(date: string, gpPercent: number) {
  return {
    date,
    gpPercent,
    fcPercent: 100 - gpPercent,
    netSales: 0,
    stockVarianceTotal: 0,
    items: [],
  };
}

// The single Store's rollup row for a month, read straight from the table.
async function monthRow(
  t: ReturnType<typeof convexTest>,
  month: string
): Promise<Doc<"storeMonths"> | null> {
  return await t.run(async (ctx) => {
    const store = await ctx.db.query("stores").first();
    if (store === null) {
      return null;
    }
    return await ctx.db
      .query("storeMonths")
      .withIndex("by_storeId_and_month", (q) =>
        q.eq("storeId", store._id).eq("month", month)
      )
      .unique();
  });
}

test("ingesting Cashups sums the month rollup and re-upload is idempotent", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "d3.pdf",
    extract: cashupExtract("2026-06-03", 40_000),
  });
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "d4.pdf",
    extract: cashupExtract("2026-06-04", 30_000),
  });

  expect((await monthRow(t, "2026-06"))?.mtdNet).toBe(70_000);

  // Re-uploading day 3 with a corrected figure replaces, never double-counts.
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "d3.pdf",
    extract: cashupExtract("2026-06-03", 50_000),
  });

  expect((await monthRow(t, "2026-06"))?.mtdNet).toBe(80_000);
});

test("the rollup keeps the latest in-month GP%, not the largest", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Store A",
    filename: "gp4.pdf",
    extract: grossProfitExtract("2026-06-04", 60),
  });
  expect((await monthRow(t, "2026-06"))?.latestGpPercent).toBe(60);

  // A later day wins even though its GP% is lower.
  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Store A",
    filename: "gp10.pdf",
    extract: grossProfitExtract("2026-06-10", 55),
  });
  expect((await monthRow(t, "2026-06"))?.latestGpPercent).toBe(55);

  // Re-uploading the earlier day does not displace the latest day's GP%.
  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Store A",
    filename: "gp4.pdf",
    extract: grossProfitExtract("2026-06-04", 99),
  });
  expect((await monthRow(t, "2026-06"))?.latestGpPercent).toBe(55);
});

test("backfill fans out one per-Store rebuild per Store", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("stores", { clerkOrgId: "org_a", name: "Store A" });
    await ctx.db.insert("stores", { clerkOrgId: "org_b", name: "Store B" });
  });

  const scheduled = await t.mutation(internal.storeMonths.backfill, {});
  expect(scheduled).toBe(2);

  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  expect(jobs).toHaveLength(2);
  expect(jobs.every((job) => job.name.includes("backfillStore"))).toBe(true);
});

test("rollups are scoped per month", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "may.pdf",
    extract: cashupExtract("2026-05-20", 10_000),
  });
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "jun.pdf",
    extract: cashupExtract("2026-06-20", 25_000),
  });

  expect((await monthRow(t, "2026-05"))?.mtdNet).toBe(10_000);
  expect((await monthRow(t, "2026-06"))?.mtdNet).toBe(25_000);
});
