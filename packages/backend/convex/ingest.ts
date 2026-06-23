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

// The figures a Royalty report owns on a Store Day: the net-turnover channel
// mix, the turnover/tax totals and the royalty due. `netSales` is read only to
// verify the royalty due — it stays a Cashup-owned figure and is not persisted.
const channelMix = v.object({
  callIn: v.number(),
  counter: v.number(),
  mobileApp: v.number(),
  mrDelivery: v.number(),
  uberEats: v.number(),
  website: v.number(),
});

const royaltyExtract = v.object({
  date: v.string(),
  channelMix,
  deliveryFees: v.number(),
  netSales: v.number(),
  netTurnover: v.number(),
  royaltyDue: v.number(),
  tax: v.number(),
});

const ROYALTY_RATE_PERCENT = 8;
const PERCENT = 100;

export const royalty = mutation({
  args: {
    storeName: v.string(),
    filename: v.string(),
    extract: royaltyExtract,
  },
  returns: v.object({
    storeDayId: v.id("storeDays"),
    needsReview: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const store = await getOrCreateActiveStore(ctx, args.storeName);

    const existing = await ctx.db
      .query("storeDays")
      .withIndex("by_storeId_and_date", (q) =>
        q.eq("storeId", store._id).eq("date", args.extract.date)
      )
      .unique();

    // Verify royalty due against the day's Net Sales when a Cashup has already
    // set it, else against the Royalty report's own Net Sales figure.
    const netSales = existing?.netSales ?? args.extract.netSales;
    const expectedRoyalty = Math.round(
      (netSales * ROYALTY_RATE_PERCENT) / PERCENT
    );
    // Preserve review reasons raised by other report-types; replace our own so
    // re-uploading a Royalty is idempotent.
    const carried = (existing?.needsReviewReasons ?? []).filter(
      (reason) => !reason.startsWith("Royalty due")
    );
    const reasons =
      expectedRoyalty === args.extract.royaltyDue
        ? carried
        : [
            ...carried,
            `Royalty due ${args.extract.royaltyDue} is not ${ROYALTY_RATE_PERCENT}% of net sales ${netSales} (expected ${expectedRoyalty})`,
          ];
    const needsReview = reasons.length > 0;

    const fields = {
      channelMix: args.extract.channelMix,
      netTurnover: args.extract.netTurnover,
      deliveryFees: args.extract.deliveryFees,
      tax: args.extract.tax,
      royaltyDue: args.extract.royaltyDue,
      needsReview,
      needsReviewReasons: reasons,
    };

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
      reportType: "royalty",
      status: "parsed",
    });

    return { storeDayId, needsReview };
  },
});
