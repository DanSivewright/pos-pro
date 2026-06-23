import { v } from "convex/values";
import { query } from "./_generated/server";
import { getPermittedStores } from "./lib/authz";

// The Store Days for one Store, newest first. Store-scoped: a caller only sees
// days for a Store they are permitted to view (their active org, or any Store
// for a super-user). An unpermitted storeId returns nothing rather than error.
export const listForStore = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, args) => {
    const permitted = await getPermittedStores(ctx);
    const allowed = permitted.some((store) => store._id === args.storeId);
    if (!allowed) {
      return [];
    }
    const days = await ctx.db
      .query("storeDays")
      .withIndex("by_storeId_and_date", (q) => q.eq("storeId", args.storeId))
      .order("desc")
      .collect();
    return days.map((day) => ({
      id: day._id,
      date: day.date,
      netSales: day.netSales ?? null,
      cashVariance: day.cashVariance ?? null,
      channelMix: day.channelMix ?? null,
      royaltyDue: day.royaltyDue ?? null,
      gpPercent: day.gpPercent ?? null,
      fcPercent: day.fcPercent ?? null,
      needsReview: day.needsReview ?? false,
    }));
  },
});

const TOP_VARIANCE_LIMIT = 5;

// The largest stock variances on one Store Day, ranked by the size of the
// variance regardless of direction (the worst over- and under-usage). Returns
// nothing for a day the caller may not see or that has no per-item set.
export const topStockVariances = query({
  args: { storeDayId: v.id("storeDays") },
  handler: async (ctx, args) => {
    const day = await ctx.db.get(args.storeDayId);
    if (day === null) {
      return [];
    }
    const permitted = await getPermittedStores(ctx);
    if (!permitted.some((store) => store._id === day.storeId)) {
      return [];
    }
    const items = await ctx.db
      .query("stockVarianceItems")
      .withIndex("by_storeDayId", (q) => q.eq("storeDayId", args.storeDayId))
      .collect();
    return items
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, TOP_VARIANCE_LIMIT)
      .map((item) => ({
        code: item.code,
        name: item.name,
        category: item.category,
        variance: item.variance,
        variancePercent: item.variancePercent,
      }));
  },
});
