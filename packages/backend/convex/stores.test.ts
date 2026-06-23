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
