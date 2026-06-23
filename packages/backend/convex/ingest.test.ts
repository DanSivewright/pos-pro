/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Mirrors the reference Store Cashup (Roman's Pizza Boitumelo, 2026-06-07).
const REFERENCE_EXTRACT = {
  date: "2026-06-07",
  grossSales: 1_266_090,
  discounts: 8990,
  refunds: 0,
  voids: 0,
  netSales: 1_257_100,
  tips: 0,
  cashVariance: -14_550,
  cardVariance: 14_550,
};

test("ingesting a Cashup creates one Store Day with the extracted figures", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
  });

  expect(result.needsReview).toBe(false);

  const { days, files, stores } = await t.run(async (ctx) => ({
    days: await ctx.db.query("storeDays").collect(),
    files: await ctx.db.query("uploadedFiles").collect(),
    stores: await ctx.db.query("stores").collect(),
  }));

  expect(stores).toHaveLength(1);
  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({
    date: "2026-06-07",
    grossSales: 1_266_090,
    netSales: 1_257_100,
    discounts: 8990,
    cashVariance: -14_550,
    cardVariance: 14_550,
    needsReview: false,
  });
  expect(files).toHaveLength(1);
  expect(files[0]).toMatchObject({
    filename: "Store_Cashup.pdf",
    reportType: "cashup",
    status: "parsed",
  });
});

test("re-uploading the same Cashup overwrites the day, not duplicating it", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "first.pdf",
    extract: REFERENCE_EXTRACT,
  });
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "second.pdf",
    extract: { ...REFERENCE_EXTRACT, netSales: 999_999, grossSales: 999_999 },
  });

  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days).toHaveLength(1);
  expect(days[0]?.netSales).toBe(999_999);
});

test("a Cashup whose net sales does not reconcile is flagged for review", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "broken.pdf",
    extract: { ...REFERENCE_EXTRACT, netSales: 1_000_000 },
  });

  expect(result.needsReview).toBe(true);
  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days[0]?.needsReview).toBe(true);
  expect(days[0]?.needsReviewReasons?.length).toBeGreaterThan(0);
});

// Mirrors the reference Royalty report (Roman's Pizza Boitumelo, 2026-06-07).
const REFERENCE_ROYALTY = {
  date: "2026-06-07",
  channelMix: {
    callIn: 114_820,
    counter: 917_710,
    mobileApp: 11_380,
    mrDelivery: 213_190,
    uberEats: 0,
    website: 0,
  },
  netSales: 1_257_100,
  deliveryFees: 0,
  netTurnover: 1_093_130,
  tax: 163_970,
  royaltyDue: 100_568,
};

test("a Royalty after a Cashup merges onto the one Store Day", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
  });
  const result = await asStore.mutation(api.ingest.royalty, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Royalty.pdf",
    extract: REFERENCE_ROYALTY,
  });

  expect(result.needsReview).toBe(false);

  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({
    date: "2026-06-07",
    netSales: 1_257_100,
    cashVariance: -14_550,
    netTurnover: 1_093_130,
    royaltyDue: 100_568,
    channelMix: REFERENCE_ROYALTY.channelMix,
    needsReview: false,
  });
});

test("a Royalty alone creates a Store Day with its figures", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.royalty, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Royalty.pdf",
    extract: REFERENCE_ROYALTY,
  });

  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days).toHaveLength(1);
  expect(days[0]?.royaltyDue).toBe(100_568);
  expect(days[0]?.netSales).toBeUndefined();
});

test("a Royalty due that is not 8% of net sales is flagged for review", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.royalty, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "broken.pdf",
    extract: { ...REFERENCE_ROYALTY, royaltyDue: 200_000 },
  });

  expect(result.needsReview).toBe(true);
  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days[0]?.needsReviewReasons?.[0]).toContain("Royalty due");
});

// Mirrors the reference Gross Profit report (Roman's Pizza Boitumelo,
// 2026-06-07): GP% 57.21, FC% 42.79, grand variance R61.05, with a couple of
// per-item rows standing in for the full 152-row set.
const REFERENCE_GROSS_PROFIT = {
  date: "2026-06-07",
  gpPercent: 57.21,
  fcPercent: 42.79,
  netSales: 1_257_100,
  stockVarianceTotal: 6105,
  items: [
    {
      code: "DMM004",
      name: "Mozzarella Underberg / Bandini Mix",
      category: "CHEESE",
      actualCos: 166_908,
      theoreticalCos: 177_564,
      variance: 10_656,
      variancePercent: 6,
    },
    {
      code: "MMC003",
      name: "Marinated Chicken",
      category: "MEAT",
      actualCos: 85_715,
      theoreticalCos: 71_563,
      variance: -14_152,
      variancePercent: -19.78,
    },
  ],
};

test("a Gross Profit writes the GP/FC figures and the per-item variance set", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Gross_Profit.pdf",
    extract: REFERENCE_GROSS_PROFIT,
  });

  expect(result.needsReview).toBe(false);

  const { days, items } = await t.run(async (ctx) => ({
    days: await ctx.db.query("storeDays").collect(),
    items: await ctx.db.query("stockVarianceItems").collect(),
  }));

  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({
    date: "2026-06-07",
    gpPercent: 57.21,
    fcPercent: 42.79,
    stockVarianceTotal: 6105,
    itemsProvider: "grossProfit",
    needsReview: false,
  });
  // Net Sales stays Cashup-owned: a Gross Profit alone never sets it.
  expect(days[0]?.netSales).toBeUndefined();
  expect(items).toHaveLength(2);
  expect(items.map((row) => row.code).sort()).toEqual(["DMM004", "MMC003"]);
});

test("re-uploading a Gross Profit fully replaces the per-item set", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "first.pdf",
    extract: REFERENCE_GROSS_PROFIT,
  });
  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "second.pdf",
    extract: {
      ...REFERENCE_GROSS_PROFIT,
      items: [REFERENCE_GROSS_PROFIT.items[0]],
    },
  });

  const items = await t.run((ctx) =>
    ctx.db.query("stockVarianceItems").collect()
  );
  expect(items).toHaveLength(1);
  expect(items[0]?.code).toBe("DMM004");
});

test("a Gross Profit whose net sales disagrees with the Cashup is flagged", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
  });
  const result = await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Gross_Profit.pdf",
    extract: { ...REFERENCE_GROSS_PROFIT, netSales: 1_000_000 },
  });

  expect(result.needsReview).toBe(true);
  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days[0]?.needsReviewReasons?.[0]).toContain("Gross Profit net sales");
});

// Mirrors the reference Stock Variance report: grand variance total -R244.12,
// with two per-item rows standing in for the full 201-row set. Its total
// disagrees materially with the Gross Profit total above (different measure).
const REFERENCE_STOCK_VARIANCE = {
  date: "2026-06-07",
  stockVarianceTotal: -24_412,
  items: [
    {
      code: "DMM004",
      name: "Mozzarella Underberg / Bandini Mix",
      category: "Cheese",
      variance: 10_656,
      variancePercent: 5.98,
    },
    {
      code: "CFC001",
      name: "Feta",
      category: "Cheese",
      variance: -1226,
      variancePercent: -18.33,
    },
  ],
};

test("a Stock Variance writes its total and the per-item set", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.stockVariance, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Stock_Variance.pdf",
    extract: REFERENCE_STOCK_VARIANCE,
  });

  expect(result.needsReview).toBe(false);

  const { days, items } = await t.run(async (ctx) => ({
    days: await ctx.db.query("storeDays").collect(),
    items: await ctx.db.query("stockVarianceItems").collect(),
  }));

  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({
    stockVarianceTotal: -24_412,
    itemsProvider: "stockVariance",
    needsReview: false,
  });
  expect(items).toHaveLength(2);
  expect(items.every((row) => row.actualCos === undefined)).toBe(true);
});

test("a Stock Variance after a Gross Profit replaces the item set (latest-wins)", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Gross_Profit.pdf",
    extract: REFERENCE_GROSS_PROFIT,
  });
  await asStore.mutation(api.ingest.stockVariance, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Stock_Variance.pdf",
    extract: REFERENCE_STOCK_VARIANCE,
  });

  const { days, items } = await t.run(async (ctx) => ({
    days: await ctx.db.query("storeDays").collect(),
    items: await ctx.db.query("stockVarianceItems").collect(),
  }));

  expect(days).toHaveLength(1);
  expect(days[0]?.itemsProvider).toBe("stockVariance");
  // Both Gross Profit rows are gone; the set is now the Stock Variance rows.
  expect(items).toHaveLength(2);
  expect(items.every((row) => row.actualCos === undefined)).toBe(true);
});

test("materially disagreeing provider totals flag the day for review", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  await asStore.mutation(api.ingest.grossProfit, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Gross_Profit.pdf",
    extract: REFERENCE_GROSS_PROFIT,
  });
  const result = await asStore.mutation(api.ingest.stockVariance, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Stock_Variance.pdf",
    extract: REFERENCE_STOCK_VARIANCE,
  });

  expect(result.needsReview).toBe(true);
  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days[0]?.needsReviewReasons?.[0]).toContain("Stock variance total");
});

test("a Stock Wastage writes the waste cost onto the Store Day", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const result = await asStore.mutation(api.ingest.stockWastage, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Stock_Wastage.pdf",
    extract: { date: "2026-06-07", wasteCost: 1324 },
  });

  expect(result.needsReview).toBe(false);
  const days = await t.run((ctx) => ctx.db.query("storeDays").collect());
  expect(days).toHaveLength(1);
  expect(days[0]?.wasteCost).toBe(1324);
});

test("ingesting without an active organization is rejected", async () => {
  const t = convexTest(schema, modules);
  const asNobody = t.withIdentity({ subject: "user_x" });

  await expect(
    asNobody.mutation(api.ingest.cashup, {
      storeName: "Nowhere",
      filename: "x.pdf",
      extract: REFERENCE_EXTRACT,
    })
  ).rejects.toThrow("No active organization");
});
