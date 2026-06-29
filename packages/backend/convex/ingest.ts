import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import {
  getOrCreateActiveStore,
  getPermittedStores,
  requireCaller,
} from "./lib/authz";
import { monthOf, recomputeStoreMonth } from "./lib/rollup";

type ReportType =
  | "cashup"
  | "royalty"
  | "grossProfit"
  | "stockVariance"
  | "stockWastage";

// Records one successfully-parsed file's provenance. When the caller supplies a
// batch upload (a multi-file action), the file joins it; otherwise the file is
// its own single-file batch. The Store Day write and this provenance row share
// one transaction, so a file's data and its record land together or not at all.
async function recordParsedFile(
  ctx: MutationCtx,
  args: {
    batchUploadId: Id<"uploads"> | undefined;
    store: Doc<"stores">;
    uploadedBy: string;
    storeDayId: Id<"storeDays">;
    filename: string;
    reportType: ReportType;
  }
): Promise<void> {
  const uploadId =
    args.batchUploadId ??
    (await ctx.db.insert("uploads", {
      storeId: args.store._id,
      uploadedBy: args.uploadedBy,
      fileCount: 1,
    }));
  await ctx.db.insert("uploadedFiles", {
    uploadId,
    storeDayId: args.storeDayId,
    filename: args.filename,
    reportType: args.reportType,
    status: "parsed",
  });
}

// Opens an upload batch for a multi-file action and returns its id. Every file
// in the action — parsed, failed or unsupported — is recorded against it, so
// the batch's fileCount is the total selected, not just the successes.
export const createBatch = mutation({
  args: {
    storeName: v.string(),
    fileCount: v.number(),
    // Display-only provenance resolved by the trusted upload route from Clerk;
    // the authorising identity is still derived server-side (caller.subject +
    // the active-org store), so this name never gates access.
    uploaderName: v.optional(v.string()),
  },
  returns: v.object({ uploadId: v.id("uploads") }),
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const store = await getOrCreateActiveStore(ctx, args.storeName);
    const uploadId = await ctx.db.insert("uploads", {
      storeId: store._id,
      uploadedBy: caller.subject,
      uploaderName: args.uploaderName,
      fileCount: args.fileCount,
    });
    return { uploadId };
  },
});

// Records a file that never reached ingest: either unrecognised (unsupported)
// or recognised but unparseable (failed). No Store Day is touched, so a bad
// file in a batch leaves no partial data behind — only its provenance row.
export const recordUnparsed = mutation({
  args: {
    uploadId: v.id("uploads"),
    filename: v.string(),
    status: v.union(v.literal("failed"), v.literal("unsupported")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const permitted = await getPermittedStores(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || !permitted.some((s) => s._id === upload.storeId)) {
      throw new Error("Upload batch not found");
    }
    await ctx.db.insert("uploadedFiles", {
      uploadId: args.uploadId,
      filename: args.filename,
      status: args.status,
      reason: args.reason,
    });
    return null;
  },
});

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
    uploadId: v.optional(v.id("uploads")),
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

    // Cashup owns net sales; keep the month rollup current.
    await recomputeStoreMonth(ctx, store._id, monthOf(args.extract.date));

    await recordParsedFile(ctx, {
      batchUploadId: args.uploadId,
      store,
      uploadedBy: caller.subject,
      storeDayId,
      filename: args.filename,
      reportType: "cashup",
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
    uploadId: v.optional(v.id("uploads")),
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

    await recordParsedFile(ctx, {
      batchUploadId: args.uploadId,
      store,
      uploadedBy: caller.subject,
      storeDayId,
      filename: args.filename,
      reportType: "royalty",
    });

    return { storeDayId, needsReview };
  },
});

// Gross Profit and Stock Variance both report a grand stock-variance total but
// measure it differently (cost-of-sales vs usage value), so when one provider
// has already set the day's total and the other lands a materially different
// figure, the day is flagged for a human to reconcile. A tolerance absorbs
// rounding. Returns the review reason, or null when the totals agree (or only
// one provider has reported).
const MATERIAL_VARIANCE_TOLERANCE = 100;

function varianceMismatchReason(
  existing: Doc<"storeDays"> | null,
  incomingTotal: number,
  incomingProvider: "grossProfit" | "stockVariance"
): string | null {
  if (
    existing?.stockVarianceTotal === undefined ||
    existing.itemsProvider === undefined ||
    existing.itemsProvider === incomingProvider ||
    Math.abs(existing.stockVarianceTotal - incomingTotal) <=
      MATERIAL_VARIANCE_TOLERANCE
  ) {
    return null;
  }
  return `Stock variance total ${incomingTotal} (${incomingProvider}) disagrees with ${existing.stockVarianceTotal} (${existing.itemsProvider})`;
}

// The figures a Gross Profit report owns on a Store Day: the achieved GP%/FC%,
// the grand stock-variance total and the full per-item stock-variance set. Its
// `netSales` is read only to reconcile against the day's Net Sales — it stays a
// Cashup-owned figure and is not persisted.
const stockVarianceItem = v.object({
  code: v.string(),
  name: v.string(),
  category: v.string(),
  actualCos: v.number(),
  theoreticalCos: v.number(),
  variance: v.number(),
  variancePercent: v.number(),
});

const grossProfitExtract = v.object({
  date: v.string(),
  gpPercent: v.number(),
  fcPercent: v.number(),
  netSales: v.number(),
  stockVarianceTotal: v.number(),
  items: v.array(stockVarianceItem),
});

export const grossProfit = mutation({
  args: {
    storeName: v.string(),
    filename: v.string(),
    extract: grossProfitExtract,
    uploadId: v.optional(v.id("uploads")),
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

    // Reconcile the report's Net Sales against the day's Net Sales when a Cashup
    // has already set it; a mismatch flags the day. Also flag when the day's
    // variance total was set by Stock Variance and disagrees materially.
    // Preserve other report-types' reasons; replace our own so re-uploading a
    // Gross Profit is idempotent.
    const reasons = (existing?.needsReviewReasons ?? []).filter(
      (reason) =>
        !(
          reason.startsWith("Gross Profit net sales") ||
          reason.startsWith("Stock variance total")
        )
    );
    if (
      existing?.netSales !== undefined &&
      existing.netSales !== args.extract.netSales
    ) {
      reasons.push(
        `Gross Profit net sales ${args.extract.netSales} does not match the day's net sales ${existing.netSales}`
      );
    }
    const mismatch = varianceMismatchReason(
      existing,
      args.extract.stockVarianceTotal,
      "grossProfit"
    );
    if (mismatch !== null) {
      reasons.push(mismatch);
    }
    const needsReview = reasons.length > 0;

    const fields = {
      gpPercent: args.extract.gpPercent,
      fcPercent: args.extract.fcPercent,
      stockVarianceTotal: args.extract.stockVarianceTotal,
      itemsProvider: "grossProfit" as const,
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

    // Gross Profit owns GP%; keep the month rollup current.
    await recomputeStoreMonth(ctx, store._id, monthOf(args.extract.date));

    // The per-item set is fully replaced on each parse by the owning provider.
    const stale = await ctx.db
      .query("stockVarianceItems")
      .withIndex("by_storeDayId", (q) => q.eq("storeDayId", storeDayId))
      .collect();
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    await Promise.all(
      args.extract.items.map((item) =>
        ctx.db.insert("stockVarianceItems", { storeDayId, ...item })
      )
    );

    await recordParsedFile(ctx, {
      batchUploadId: args.uploadId,
      store,
      uploadedBy: caller.subject,
      storeDayId,
      filename: args.filename,
      reportType: "grossProfit",
    });

    return { storeDayId, needsReview };
  },
});

// The figures a Stock Variance report owns on a Store Day: the grand variance
// total and the full per-item stock-variance set. It is the alternative
// provider of that set (the other being Gross Profit); each row contributes
// only the money variance and its percentage, as the report gives usage as
// quantities rather than per-item cost-of-sales money.
const stockVarianceRow = v.object({
  code: v.string(),
  name: v.string(),
  category: v.string(),
  variance: v.number(),
  variancePercent: v.number(),
});

const stockVarianceExtract = v.object({
  date: v.string(),
  stockVarianceTotal: v.number(),
  items: v.array(stockVarianceRow),
});

export const stockVariance = mutation({
  args: {
    storeName: v.string(),
    filename: v.string(),
    extract: stockVarianceExtract,
    uploadId: v.optional(v.id("uploads")),
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

    // Flag when the day's variance total was set by Gross Profit and disagrees
    // materially. Preserve other report-types' reasons; replace our own so
    // re-uploading a Stock Variance is idempotent.
    const reasons = (existing?.needsReviewReasons ?? []).filter(
      (reason) => !reason.startsWith("Stock variance total")
    );
    const mismatch = varianceMismatchReason(
      existing,
      args.extract.stockVarianceTotal,
      "stockVariance"
    );
    if (mismatch !== null) {
      reasons.push(mismatch);
    }
    const needsReview = reasons.length > 0;

    const fields = {
      stockVarianceTotal: args.extract.stockVarianceTotal,
      itemsProvider: "stockVariance" as const,
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

    // The per-item set is fully replaced on each parse by the owning provider.
    const stale = await ctx.db
      .query("stockVarianceItems")
      .withIndex("by_storeDayId", (q) => q.eq("storeDayId", storeDayId))
      .collect();
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    await Promise.all(
      args.extract.items.map((item) =>
        ctx.db.insert("stockVarianceItems", { storeDayId, ...item })
      )
    );

    await recordParsedFile(ctx, {
      batchUploadId: args.uploadId,
      store,
      uploadedBy: caller.subject,
      storeDayId,
      filename: args.filename,
      reportType: "stockVariance",
    });

    return { storeDayId, needsReview };
  },
});

// The single figure a Stock Wastage report owns on a Store Day: the day's total
// waste cost (the report's Grand Total).
const stockWastageExtract = v.object({
  date: v.string(),
  wasteCost: v.number(),
});

export const stockWastage = mutation({
  args: {
    storeName: v.string(),
    filename: v.string(),
    extract: stockWastageExtract,
    uploadId: v.optional(v.id("uploads")),
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

    let storeDayId = existing?._id;
    if (storeDayId === undefined) {
      storeDayId = await ctx.db.insert("storeDays", {
        storeId: store._id,
        date: args.extract.date,
        wasteCost: args.extract.wasteCost,
      });
    } else {
      await ctx.db.patch(storeDayId, { wasteCost: args.extract.wasteCost });
    }

    await recordParsedFile(ctx, {
      batchUploadId: args.uploadId,
      store,
      uploadedBy: caller.subject,
      storeDayId,
      filename: args.filename,
      reportType: "stockWastage",
    });

    return { storeDayId, needsReview: existing?.needsReview ?? false };
  },
});
