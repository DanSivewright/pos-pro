import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const MAX_STORES = 200;

// The latest Store Day per Store, flattened to the figures the digest reasons
// over. Internal: the cron runs it with no caller, so it is never store-scoped
// — it deliberately reads every Store to build the super-user's consolidated
// view and each Store's own section. Lives in the default V8 runtime; the
// Node-runtime `digest.send` action reads it via ctx.runQuery (a query cannot
// live in a "use node" file).
export const dataForDigest = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      storeName: v.string(),
      clerkOrgId: v.string(),
      input: v.object({
        netSales: v.union(v.number(), v.null()),
        salesTarget: v.union(v.number(), v.null()),
        gpPercent: v.union(v.number(), v.null()),
        cashVariance: v.union(v.number(), v.null()),
        stockVarianceTotal: v.union(v.number(), v.null()),
      }),
    })
  ),
  handler: async (ctx) => {
    const stores = await ctx.db.query("stores").take(MAX_STORES);
    const rows = await Promise.all(
      stores.map(async (store) => {
        const latest = await ctx.db
          .query("storeDays")
          .withIndex("by_storeId_and_date", (q) => q.eq("storeId", store._id))
          .order("desc")
          .first();
        return {
          storeName: store.name,
          clerkOrgId: store.clerkOrgId,
          input: {
            netSales: latest?.netSales ?? null,
            salesTarget: store.salesTarget ?? null,
            gpPercent: latest?.gpPercent ?? null,
            cashVariance: latest?.cashVariance ?? null,
            stockVarianceTotal: latest?.stockVarianceTotal ?? null,
          },
        };
      })
    );
    return rows;
  },
});
