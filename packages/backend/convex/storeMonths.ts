import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { monthOf, recomputeStoreMonth } from "./lib/rollup";

const MAX_STORES = 200;

// Rebuilds the `storeMonths` rollup for every Store from its Store Days. Fans a
// per-Store rebuild out via the scheduler (like the digest send) so each runs
// in its own transaction — the orchestrator only reads the Store list, and no
// single transaction has to scan every Store's full history. Idempotent: safe
// to re-run, recomputing the same rows. Invoke on a deployment after the
// `storeMonths` table is first added: `convex run storeMonths:backfill`.
export const backfill = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const stores = await ctx.db.query("stores").take(MAX_STORES);
    for (const store of stores) {
      await ctx.scheduler.runAfter(0, internal.storeMonths.backfillStore, {
        storeId: store._id,
      });
    }
    return stores.length;
  },
});

// Rebuilds the rollup for one Store across every month it has Store Days in.
// Bounded by a single Store's history, so it stays within transaction limits.
export const backfillStore = internalMutation({
  args: { storeId: v.id("stores") },
  returns: v.null(),
  handler: async (ctx, { storeId }) => {
    const days = await ctx.db
      .query("storeDays")
      .withIndex("by_storeId_and_date", (q) => q.eq("storeId", storeId))
      .collect();
    const months = new Set<string>();
    for (const day of days) {
      months.add(monthOf(day.date));
    }
    for (const month of months) {
      await recomputeStoreMonth(ctx, storeId, month);
    }
    return null;
  },
});
