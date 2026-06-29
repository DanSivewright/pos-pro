import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getPermittedStores } from "./lib/authz";

// The shape a paginated query must return to an unpermitted caller: a single
// empty, exhausted page. Keeps the IDOR contract (returns nothing, never throws)
// while staying compatible with `usePaginatedQuery` on the client.
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

// The Store Days for one Store, newest first, one page at a time. Store-scoped:
// a caller only sees days for a Store they are permitted to view (their active
// org, or any Store for a super-user). An unpermitted storeId returns an empty
// page rather than error.
export const listForStore = query({
  args: { storeId: v.id("stores"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const permitted = await getPermittedStores(ctx);
    const allowed = permitted.some((store) => store._id === args.storeId);
    if (!allowed) {
      return EMPTY_PAGE;
    }
    const result = await ctx.db
      .query("storeDays")
      .withIndex("by_storeId_and_date", (q) => q.eq("storeId", args.storeId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = result.page.map((day) => ({
      id: day._id,
      date: day.date,
      netSales: day.netSales ?? null,
      cashVariance: day.cashVariance ?? null,
      channelMix: day.channelMix ?? null,
      royaltyDue: day.royaltyDue ?? null,
      gpPercent: day.gpPercent ?? null,
      fcPercent: day.fcPercent ?? null,
      wasteCost: day.wasteCost ?? null,
      itemsProvider: day.itemsProvider ?? null,
      needsReview: day.needsReview ?? false,
      // Which report-types have landed on this day, derived from the field
      // subsets each owns. Drives the completeness display.
      reports: {
        cashup: day.netSales !== undefined,
        royalty: day.royaltyDue !== undefined,
        grossProfit: day.gpPercent !== undefined,
        stockVariance: day.itemsProvider === "stockVariance",
        stockWastage: day.wasteCost !== undefined,
      },
    }));
    return { ...result, page };
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
