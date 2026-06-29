import { v } from "convex/values";
import { query } from "./_generated/server";
import { getPermittedStores } from "./lib/authz";

// The most recent upload batches surfaced per Store. Older batches accumulate
// unbounded, so the history is capped to a recent window. Cursor pagination is
// the correct fix and is tracked in DEBT.md.
const HISTORY_LIMIT = 50;

// The upload audit trail for one Store, newest batch first. Store-scoped like
// storeDays.listForStore: a caller only sees the history of a Store they are
// permitted to view (their active org, or any Store for a super-user). An
// unpermitted storeId returns nothing rather than erroring.
//
// Each batch carries its files' provenance: the parse status, the report-type,
// the resolved Store Day date (when the file landed on one) and the failure
// reason. Raw file bytes are never retained, so this is purely a record of what
// was submitted and whether it parsed. `uploadedBy` is the raw Clerk subject
// id; resolving it to a human name needs a Clerk fetch (an action, not a
// query) and is tracked as a follow-up in DEBT.md.
export const listForStore = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, args) => {
    const permitted = await getPermittedStores(ctx);
    const allowed = permitted.some((store) => store._id === args.storeId);
    if (!allowed) {
      return [];
    }
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_storeId", (q) => q.eq("storeId", args.storeId))
      .order("desc")
      .take(HISTORY_LIMIT);

    return await Promise.all(
      uploads.map(async (upload) => {
        const fileRows = await ctx.db
          .query("uploadedFiles")
          .withIndex("by_uploadId", (q) => q.eq("uploadId", upload._id))
          .collect();
        const files = await Promise.all(
          fileRows.map(async (file) => {
            const day =
              file.storeDayId === undefined
                ? null
                : await ctx.db.get(file.storeDayId);
            return {
              filename: file.filename,
              reportType: file.reportType ?? null,
              status: file.status,
              reason: file.reason ?? null,
              date: day?.date ?? null,
              dateRangeStart: file.dateRangeStart ?? null,
              dateRangeEnd: file.dateRangeEnd ?? null,
            };
          })
        );
        return {
          id: upload._id,
          uploadedAt: upload._creationTime,
          uploadedBy: upload.uploadedBy,
          fileCount: upload.fileCount,
          files,
        };
      })
    );
  },
});
