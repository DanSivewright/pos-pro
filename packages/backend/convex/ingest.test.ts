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
