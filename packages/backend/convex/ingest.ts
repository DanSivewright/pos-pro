import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getOrCreateActiveStore, requireCaller } from "./lib/authz";

// The figures a Cashup report owns on a Store Day. Re-uploading a Cashup
// overwrites exactly this subset; other report-types' fields are untouched.
const cashupExtract = v.object({
  date: v.string(),
  grossSales: v.number(),
  discounts: v.number(),
  refunds: v.number(),
  voids: v.number(),
  netSales: v.number(),
  tips: v.number(),
  cashVariance: v.number(),
  cardVariance: v.number(),
});

interface CashupExtract {
  cardVariance: number;
  cashVariance: number;
  date: string;
  discounts: number;
  grossSales: number;
  netSales: number;
  refunds: number;
  tips: number;
  voids: number;
}

// Light verification: the report's Net Sales must equal Gross Sales less the
// deductions it itemises. A mismatch means the extraction or the source is
// suspect, so the Store Day is flagged rather than trusted silently.
function reviewReasons(extract: CashupExtract): string[] {
  const reasons: string[] = [];
  const expectedNet =
    extract.grossSales - extract.discounts - extract.refunds - extract.voids;
  if (expectedNet !== extract.netSales) {
    reasons.push(
      `Net Sales ${extract.netSales} does not reconcile to Gross less deductions ${expectedNet}`
    );
  }
  return reasons;
}

export const cashup = mutation({
  args: {
    storeName: v.string(),
    filename: v.string(),
    extract: cashupExtract,
  },
  returns: v.object({
    storeDayId: v.id("storeDays"),
    needsReview: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const store = await getOrCreateActiveStore(ctx, args.storeName);

    const reasons = reviewReasons(args.extract);
    const needsReview = reasons.length > 0;
    const fields = {
      grossSales: args.extract.grossSales,
      netSales: args.extract.netSales,
      discounts: args.extract.discounts,
      refunds: args.extract.refunds,
      voids: args.extract.voids,
      tips: args.extract.tips,
      cashVariance: args.extract.cashVariance,
      cardVariance: args.extract.cardVariance,
      needsReview,
      needsReviewReasons: reasons,
    };

    const existing = await ctx.db
      .query("storeDays")
      .withIndex("by_storeId_and_date", (q) =>
        q.eq("storeId", store._id).eq("date", args.extract.date)
      )
      .unique();

    let storeDayId = existing?._id;
    if (storeDayId === undefined) {
      storeDayId = await ctx.db.insert("storeDays", {
        storeId: store._id,
        date: args.extract.date,
        ...fields,
      });
    } else {
      await ctx.db.patch(storeDayId, fields);
    }

    const uploadId = await ctx.db.insert("uploads", {
      storeId: store._id,
      uploadedBy: caller.subject,
      fileCount: 1,
    });
    await ctx.db.insert("uploadedFiles", {
      uploadId,
      storeDayId,
      filename: args.filename,
      reportType: "cashup",
      status: "parsed",
    });

    return { storeDayId, needsReview };
  },
});
