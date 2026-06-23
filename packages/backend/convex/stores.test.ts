/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("a store user sees only their own Store", async () => {
  const t = convexTest(schema, modules);
  const storeAId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("stores", {
      clerkOrgId: "org_a",
      name: "Store A",
    });
    await ctx.db.insert("stores", { clerkOrgId: "org_b", name: "Store B" });
    return id;
  });

  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  const stores = await asStoreA.query(api.stores.listPermitted, {});

  expect(stores).toHaveLength(1);
  expect(stores[0]?.id).toBe(storeAId);
  expect(stores[0]?.name).toBe("Store A");
});

test("a super-user sees every Store", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("stores", { clerkOrgId: "org_a", name: "Store A" });
    await ctx.db.insert("stores", { clerkOrgId: "org_b", name: "Store B" });
  });

  const asSuperuser = t.withIdentity({ subject: "owner", superuser: true });
  const stores = await asSuperuser.query(api.stores.listPermitted, {});

  expect(stores).toHaveLength(2);
});

test("a user with no matching active org sees no Stores", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("stores", { clerkOrgId: "org_a", name: "Store A" });
  });

  const asOutsider = t.withIdentity({ subject: "user_x", org_id: "org_z" });
  const stores = await asOutsider.query(api.stores.listPermitted, {});

  expect(stores).toHaveLength(0);
});

test("an unauthenticated caller is rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.stores.listPermitted, {})).rejects.toThrow(
    "Not authenticated"
  );
});

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

function sastMonth(): string {
  return new Date(Date.now() + SAST_OFFSET_MS).toISOString().slice(0, 7);
}

test("the Control Tower shows a store user only their own Store", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("stores", { clerkOrgId: "org_a", name: "Store A" });
    await ctx.db.insert("stores", { clerkOrgId: "org_b", name: "Store B" });
  });

  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  const tiles = await asStoreA.query(api.stores.controlTower, {});

  expect(tiles).toHaveLength(1);
  expect(tiles[0]?.name).toBe("Store A");
});

test("the Control Tower shows a super-user every Store, worst-first", async () => {
  const t = convexTest(schema, modules);
  const month = sastMonth();
  await t.run(async (ctx) => {
    // Store A hits target (green); Store B is 25% below target (red).
    const a = await ctx.db.insert("stores", {
      clerkOrgId: "org_a",
      name: "Store A",
      salesTarget: 100_000,
    });
    const b = await ctx.db.insert("stores", {
      clerkOrgId: "org_b",
      name: "Store B",
      salesTarget: 100_000,
    });
    await ctx.db.insert("storeDays", {
      storeId: a,
      date: `${month}-05`,
      netSales: 100_000,
    });
    await ctx.db.insert("storeDays", {
      storeId: b,
      date: `${month}-05`,
      netSales: 75_000,
    });
  });

  const asSuperuser = t.withIdentity({ subject: "owner", superuser: true });
  const tiles = await asSuperuser.query(api.stores.controlTower, {});

  expect(tiles).toHaveLength(2);
  expect(tiles[0]?.name).toBe("Store B");
  expect(tiles[0]?.status).toBe("red");
  expect(tiles[1]?.name).toBe("Store A");
  expect(tiles[1]?.status).toBe("green");
});

test("the Control Tower sums net sales month-to-date and computes vs-target", async () => {
  const t = convexTest(schema, modules);
  const month = sastMonth();
  const storeId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("stores", {
      clerkOrgId: "org_a",
      name: "Store A",
      salesTarget: 100_000,
    });
    await ctx.db.insert("storeDays", {
      storeId: id,
      date: `${month}-03`,
      netSales: 40_000,
    });
    await ctx.db.insert("storeDays", {
      storeId: id,
      date: `${month}-04`,
      netSales: 30_000,
      gpPercent: 60,
    });
    return id;
  });

  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  const [tile] = await asStoreA.query(api.stores.controlTower, {});

  expect(tile?.id).toBe(storeId);
  expect(tile?.mtdNet).toBe(70_000);
  expect(tile?.vsTarget).toBe(-30_000);
  expect(tile?.gpPercent).toBe(60);
});

test("setting a Store's sales target changes its vs-target", async () => {
  const t = convexTest(schema, modules);
  const month = sastMonth();
  const storeId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("stores", {
      clerkOrgId: "org_a",
      name: "Store A",
    });
    await ctx.db.insert("storeDays", {
      storeId: id,
      date: `${month}-05`,
      netSales: 80_000,
    });
    return id;
  });

  const asSuperuser = t.withIdentity({ subject: "owner", superuser: true });
  await asSuperuser.mutation(api.stores.setSalesTarget, {
    storeId,
    salesTarget: 100_000,
  });

  const tiles = await asSuperuser.query(api.stores.controlTower, {});
  expect(tiles[0]?.salesTarget).toBe(100_000);
  expect(tiles[0]?.vsTarget).toBe(-20_000);
});

test("a store user may not set a sales target", async () => {
  const t = convexTest(schema, modules);
  const storeId = await t.run(async (ctx) =>
    ctx.db.insert("stores", { clerkOrgId: "org_a", name: "Store A" })
  );

  const asStoreA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
  await expect(
    asStoreA.mutation(api.stores.setSalesTarget, {
      storeId,
      salesTarget: 100_000,
    })
  ).rejects.toThrow("super-users");
});
