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
      needsReview: day.needsReview ?? false,
    }));
  },
});
