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

test("a Store user cannot read another Store's upload history", async () => {
  const t = convexTest(schema, modules);
  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  const asStoreB = t.withIdentity({ subject: "user_b", org_id: "org_b" });

  await asStoreA.mutation(api.ingest.cashup, {
    storeName: "Store A",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
  });

  const storeAId = await firstStoreId(t);
  const history = await asStoreB.query(api.uploads.listForStore, {
    storeId: storeAId,
  });
  expect(history).toEqual([]);
});

test("history lists batches newest-first", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const first = await asStore.mutation(api.ingest.createBatch, {
    storeName: "Roman's Pizza Boitumelo",
    fileCount: 1,
  });
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "first.pdf",
    extract: REFERENCE_EXTRACT,
    uploadId: first.uploadId,
  });

  const second = await asStore.mutation(api.ingest.createBatch, {
    storeName: "Roman's Pizza Boitumelo",
    fileCount: 1,
  });
  await asStore.mutation(api.ingest.recordUnparsed, {
    uploadId: second.uploadId,
    filename: "second.pdf",
    status: "failed",
    reason: "Could not read PDF",
  });

  const storeId = await firstStoreId(t);
  const history = await asStore.query(api.uploads.listForStore, { storeId });

  expect(history).toHaveLength(2);
  // Newest (the failed batch) leads.
  expect(history[0]?.id).toBe(second.uploadId);
  expect(history[1]?.id).toBe(first.uploadId);
  expect(history[0]?.uploadedAt).toBeGreaterThanOrEqual(
    history[1]?.uploadedAt ?? 0
  );
});

test("parsed, failed and unsupported files all appear with their shape", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  const { uploadId } = await asStore.mutation(api.ingest.createBatch, {
    storeName: "Roman's Pizza Boitumelo",
    fileCount: 3,
  });
  await asStore.mutation(api.ingest.cashup, {
    storeName: "Roman's Pizza Boitumelo",
    filename: "Store_Cashup.pdf",
    extract: REFERENCE_EXTRACT,
    uploadId,
  });
  await asStore.mutation(api.ingest.recordUnparsed, {
    uploadId,
    filename: "menu.pdf",
    status: "unsupported",
    reason: "Unrecognised report",
  });
  await asStore.mutation(api.ingest.recordUnparsed, {
    uploadId,
    filename: "broken.pdf",
    status: "failed",
    reason: "Could not read PDF",
  });

  const storeId = await firstStoreId(t);
  const history = await asStore.query(api.uploads.listForStore, { storeId });

  expect(history).toHaveLength(1);
  const batch = history[0];
  expect(batch?.fileCount).toBe(3);
  expect(batch?.uploadedBy).toBe("user_a");
  expect(batch?.files).toHaveLength(3);

  const byName = new Map(batch?.files.map((f) => [f.filename, f]));
  const parsed = byName.get("Store_Cashup.pdf");
  expect(parsed?.status).toBe("parsed");
  expect(parsed?.reportType).toBe("cashup");
  // The resolved Store Day date is surfaced for parsed files.
  expect(parsed?.date).toBe("2026-06-07");

  const unsupported = byName.get("menu.pdf");
  expect(unsupported?.status).toBe("unsupported");
  expect(unsupported?.reportType).toBeNull();
  expect(unsupported?.reason).toBe("Unrecognised report");
  expect(unsupported?.date).toBeNull();

  const failed = byName.get("broken.pdf");
  expect(failed?.status).toBe("failed");
  expect(failed?.reason).toBe("Could not read PDF");
});

test("history is capped to the recent window", async () => {
  const t = convexTest(schema, modules);
  const asStore = t.withIdentity({ subject: "user_a", org_id: "org_a" });

  // Open the Store once, then seed more batches than the cap directly.
  await asStore.mutation(api.ingest.createBatch, {
    storeName: "Roman's Pizza Boitumelo",
    fileCount: 1,
  });
  const storeId = await firstStoreId(t);

  const TOTAL = 60;
  await t.run(async (ctx) => {
    for (let i = 0; i < TOTAL; i++) {
      await ctx.db.insert("uploads", {
        storeId,
        uploadedBy: "user_a",
        fileCount: 1,
      });
    }
  });

  const history = await asStore.query(api.uploads.listForStore, { storeId });
  expect(history).toHaveLength(50);
});
