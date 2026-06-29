import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export interface Caller {
  orgId: string | null;
  subject: string;
  superuser: boolean;
}

// Resolves the authenticated caller. The active org and super-user flag are
// read from the Clerk session token. Two shapes are supported:
//   - Native Clerk→Convex integration: active org under the `o` claim
//     ({ id, rol, slg }); super-user under a custom `superuser` session claim.
//   - Legacy custom "convex" JWT template: flat `org_id` + `superuser` claims.
// Authorization order: identity -> super-user? all : active-org -> execute.
export async function requireCaller(
  ctx: QueryCtx | MutationCtx
): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  const nativeOrg = identity.o as { id?: unknown } | undefined;
  let orgId: string | null = null;
  if (typeof identity.org_id === "string") {
    orgId = identity.org_id;
  } else if (typeof nativeOrg?.id === "string") {
    orgId = nativeOrg.id;
  }
  return {
    subject: identity.subject,
    superuser: identity.superuser === true,
    orgId,
  };
}

// Resolves the Store backing the caller's active Clerk org, creating it on
// first use. Store ownership is keyed on the JWT org claim, never on caller
// input, so a caller can only ever read or write their own Store.
export async function getOrCreateActiveStore(
  ctx: MutationCtx,
  name: string
): Promise<Doc<"stores">> {
  const caller = await requireCaller(ctx);
  const { orgId } = caller;
  if (orgId === null) {
    throw new Error("No active organization");
  }
  const existing = await ctx.db
    .query("stores")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
    .unique();
  if (existing !== null) {
    return existing;
  }
  const storeId = await ctx.db.insert("stores", { clerkOrgId: orgId, name });
  const created = await ctx.db.get(storeId);
  if (created === null) {
    throw new Error("Store creation failed");
  }
  return created;
}

// The Stores the caller may see: super-users see every Store; a store user
// sees only the Store backing their active Clerk org. The super-user read is an
// unbounded `.collect()` — the Control Tower it feeds sorts every tile globally
// worst-first, which a paginated read could not honour, and each tile is now a
// single rollup point-read (#16), so the cost is one Store row per tile.
export async function getPermittedStores(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"stores">[]> {
  const caller = await requireCaller(ctx);
  if (caller.superuser) {
    return await ctx.db.query("stores").collect();
  }
  const { orgId } = caller;
  if (orgId === null) {
    return [];
  }
  const store = await ctx.db
    .query("stores")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
    .unique();
  return store === null ? [] : [store];
}
