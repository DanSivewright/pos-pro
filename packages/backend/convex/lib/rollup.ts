import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// The "YYYY-MM" month a Store Day date falls in.
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// Rebuilds one Store's month rollup from its Store Days — the single source of
// truth for `storeMonths`. Sums the month's Cashup net sales and takes the most
// recent in-month GP%, then upserts the rollup row. Called by the ingest
// mutations that change those figures and by the backfill; idempotent, so a
// re-upload (or a re-run) lands the same row. Reads only one Store's month, so
// the cost stays at write time rather than fanning out across every read.
export async function recomputeStoreMonth(
  ctx: MutationCtx,
  storeId: Id<"stores">,
  month: string
): Promise<void> {
  const days = await ctx.db
    .query("storeDays")
    .withIndex("by_storeId_and_date", (q) =>
      q
        .eq("storeId", storeId)
        .gte("date", `${month}-01`)
        .lte("date", `${month}-31`)
    )
    .order("desc")
    .collect();

  let mtdNet = 0;
  let latestGpPercent: number | undefined;
  for (const day of days) {
    if (day.netSales !== undefined) {
      mtdNet += day.netSales;
    }
    // Days are newest-first, so the first GP% seen is the latest in the month.
    if (latestGpPercent === undefined && day.gpPercent !== undefined) {
      latestGpPercent = day.gpPercent;
    }
  }

  const existing = await ctx.db
    .query("storeMonths")
    .withIndex("by_storeId_and_month", (q) =>
      q.eq("storeId", storeId).eq("month", month)
    )
    .unique();

  if (existing === null) {
    await ctx.db.insert("storeMonths", {
      storeId,
      month,
      mtdNet,
      latestGpPercent,
    });
    return;
  }
  await ctx.db.patch(existing._id, { mtdNet, latestGpPercent });
}
