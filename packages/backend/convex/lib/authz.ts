import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_STORES = 200;

export interface Caller {
  orgId: string | null;
  subject: string;
  superuser: boolean;
}

// Resolves the authenticated caller. The super-user flag and active org are
// surfaced as custom claims on the Clerk JWT ("convex" template).
// Authorization order: identity -> super-user? all : active-org -> execute.
export async function requireCaller(
  ctx: QueryCtx | MutationCtx
): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return {
    subject: identity.subject,
    superuser: identity.superuser === true,
    orgId: typeof identity.org_id === "string" ? identity.org_id : null,
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
// sees only the Store backing their active Clerk org.
export async function getPermittedStores(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"stores">[]> {
  const caller = await requireCaller(ctx);
  if (caller.superuser) {
    return await ctx.db.query("stores").take(MAX_STORES);
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
