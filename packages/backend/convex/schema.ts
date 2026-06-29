import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Money is stored as integer cents. Percentages are stored as numbers to 2dp
// (e.g. 56.66). Store Day dates are "YYYY-MM-DD" strings in Africa/Johannesburg.

const reportType = v.union(
  v.literal("cashup"),
  v.literal("royalty"),
  v.literal("grossProfit"),
  v.literal("stockVariance"),
  v.literal("stockWastage")
);

export default defineSchema({
  // A Store is one physical business location, modelled as a Clerk Organization.
  stores: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    // Monthly expected net sales in cents. Configuration, not extracted.
    salesTarget: v.optional(v.number()),
  }).index("by_clerkOrgId", ["clerkOrgId"]),

  // One Store's trading on one calendar date. The atomic spine. Each
  // report-type owns a defined subset of these fields, merged on re-upload.
  storeDays: defineTable({
    storeId: v.id("stores"),
    date: v.string(),
    needsReview: v.optional(v.boolean()),
    needsReviewReasons: v.optional(v.array(v.string())),

    // Cashup-owned
    grossSales: v.optional(v.number()),
    netSales: v.optional(v.number()),
    discounts: v.optional(v.number()),
    refunds: v.optional(v.number()),
    voids: v.optional(v.number()),
    tips: v.optional(v.number()),
    cashVariance: v.optional(v.number()),
    cardVariance: v.optional(v.number()),

    // Royalty-owned
    netTurnover: v.optional(v.number()),
    deliveryFees: v.optional(v.number()),
    tax: v.optional(v.number()),
    royaltyDue: v.optional(v.number()),
    channelMix: v.optional(
      v.object({
        counter: v.number(),
        callIn: v.number(),
        mobileApp: v.number(),
        mrDelivery: v.number(),
        uberEats: v.number(),
        website: v.number(),
      })
    ),

    // Gross Profit / Stock Variance-owned
    gpPercent: v.optional(v.number()),
    fcPercent: v.optional(v.number()),
    stockVarianceTotal: v.optional(v.number()),
    itemsProvider: v.optional(
      v.union(v.literal("grossProfit"), v.literal("stockVariance"))
    ),

    // Stock Wastage-owned
    wasteCost: v.optional(v.number()),
  }).index("by_storeId_and_date", ["storeId", "date"]),

  // A denormalised month-to-date rollup per Store, so the Control Tower reads
  // one row per Store instead of fanning out a month-range scan over every
  // Store Day. Maintained by the ingest mutations that change a Store Day's
  // net sales (Cashup) or GP% (Gross Profit), and rebuilt by the backfill.
  // Derived state only — `storeDays` remains the source of truth.
  storeMonths: defineTable({
    storeId: v.id("stores"),
    month: v.string(), // "YYYY-MM" in Africa/Johannesburg
    mtdNet: v.number(), // summed Cashup net sales for the month, cents
    latestGpPercent: v.optional(v.number()), // most recent in-month GP%
  }).index("by_storeId_and_month", ["storeId", "month"]),

  // Per-item stock variance rows for a Store Day. Fully replaced on each parse
  // by the owning provider (Gross Profit or Stock Variance). `variance` (cents)
  // and `variancePercent` are common to both providers; `actualCos`/
  // `theoreticalCos` are only reported by Gross Profit (the Stock Variance
  // report gives usage quantities, not per-item cost-of-sales money).
  stockVarianceItems: defineTable({
    storeDayId: v.id("storeDays"),
    code: v.string(),
    name: v.string(),
    category: v.string(),
    actualCos: v.optional(v.number()),
    theoreticalCos: v.optional(v.number()),
    variance: v.number(),
    variancePercent: v.number(),
  }).index("by_storeDayId", ["storeDayId"]),

  // A single upload action: a batch of one or more files for a Store.
  uploads: defineTable({
    storeId: v.id("stores"),
    uploadedBy: v.string(),
    fileCount: v.number(),
  }).index("by_storeId", ["storeId"]),

  // One file within an Upload. Records provenance and parse status. The raw
  // file bytes are never retained.
  uploadedFiles: defineTable({
    uploadId: v.id("uploads"),
    storeDayId: v.optional(v.id("storeDays")),
    filename: v.string(),
    reportType: v.optional(reportType),
    dateRangeStart: v.optional(v.string()),
    dateRangeEnd: v.optional(v.string()),
    status: v.union(
      v.literal("parsed"),
      v.literal("failed"),
      v.literal("unsupported")
    ),
    reason: v.optional(v.string()),
  }).index("by_uploadId", ["uploadId"]),
});
