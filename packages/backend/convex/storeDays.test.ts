/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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

const FIRST_PAGE = { numItems: 30, cursor: null };

async function firstStoreId(
  t: ReturnType<typeof convexTest>
): Promise<Id<"stores">> {
  const id = await t.run((ctx) =>
    ctx.db
      .query("stores")
      .first()
      .then((s) => s?._id)
  );
  return id as Id<"stores">;
}

test("a Store user cannot read another Store's days", async () => {
  const t = convexTest(schema, modules);
  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  const asStoreB = t.withIdentity({ subject: "user_b", org_id: "org_b" });

  await asStoreA.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
  });

  const storeAId = await firstStoreId(t);
  const result = await asStoreB.query(api.storeDays.listForStore, {
    storeId: storeAId,
    paginationOpts: FIRST_PAGE,
  });
  expect(result.page).toEqual([]);
  expect(result.isDone).toBe(true);
});

test("days page newest-first, then load more exhausts the rest", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  // Open the Store once, then seed more days than one page directly.
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "first.pdf",
    extract: REFERENCE_EXTRACT,
  });
  const storeId = await firstStoreId(t);

  // Seed days for May 2026 (the reference day above is 2026-06-07) so the
  // total is 31 (May) + 1 (June) = 32, spanning two pages of 30.
  await t.run(async (ctx) => {
    for (let d = 1; d <= 31; d++) {
      const day = String(d).padStart(2, "0");
      await ctx.db.insert("storeDays", {
        storeId,
        date: `2026-05-${day}`,
        netSales: 100_000 + d,
      });
    }
  });

  const first = await asStore.query(api.storeDays.listForStore, {
    storeId,
    paginationOpts: FIRST_PAGE,
  });
  expect(first.page).toHaveLength(30);
  expect(first.isDone).toBe(false);
  // Newest day (June 7) leads the first page; order is descending by date.
  expect(first.page[0]?.date).toBe("2026-06-07");
  expect(first.page[1]?.date).toBe("2026-05-31");

  const second = await asStore.query(api.storeDays.listForStore, {
    storeId,
    paginationOpts: { numItems: 30, cursor: first.continueCursor },
  });
  expect(second.page).toHaveLength(2);
  expect(second.isDone).toBe(true);
  // The two oldest remaining days, still descending.
  expect(second.page[0]?.date).toBe("2026-05-02");
  expect(second.page[1]?.date).toBe("2026-05-01");
});
