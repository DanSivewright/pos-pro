import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getPermittedStores, requireCaller } from "./lib/authz";
import { computeStatus, STATUS_RANK, type Status } from "./lib/thresholds";

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// The current month in Africa/Johannesburg as "YYYY-MM", used to bound the
// month-to-date Store Day range.
function currentSastMonth(): string {
  return new Date(Date.now() + SAST_OFFSET_MS).toISOString().slice(0, 7);
}

export const listPermitted = query({
  args: {},
  handler: async (ctx) => {
    const stores = await getPermittedStores(ctx);
    return stores.map((store) => ({
      id: store._id,
      name: store.name,
      salesTarget: store.salesTarget ?? null,
    }));
  },
});

// Whether the caller is a super-user. Drives UI gating (only super-users may
// edit sales targets); the mutation itself re-checks, so this is advisory.
export const isSuperuser = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);
    return caller.superuser;
  },
});

interface ControlTowerTile {
  gpPercent: number | null;
  id: Doc<"stores">["_id"];
  mtdNet: number;
  name: string;
  salesTarget: number | null;
  status: Status;
  vsTarget: number | null;
}

// The month-to-date tile for one Store, read from the denormalised `storeMonths`
// rollup — a single indexed point-read per Store, rather than scanning the
// month's Store Days. The rollup is kept current by the ingest mutations; a
// Store with no rollup row yet (no Cashup/GP this month) reads as zero net /
// no GP%.
async function buildTile(
  ctx: QueryCtx,
  store: Doc<"stores">,
  month: string
): Promise<ControlTowerTile> {
  const rollup = await ctx.db
    .query("storeMonths")
    .withIndex("by_storeId_and_month", (q) =>
      q.eq("storeId", store._id).eq("month", month)
    )
    .unique();

  const mtdNet = rollup?.mtdNet ?? 0;
  const gpPercent = rollup?.latestGpPercent ?? null;

  const salesTarget = store.salesTarget ?? null;
  const vsTarget = salesTarget === null ? null : mtdNet - salesTarget;
  const salesDeviation =
    salesTarget === null || salesTarget === 0 ? null : mtdNet / salesTarget - 1;

  return {
    id: store._id,
    name: store.name,
    salesTarget,
    mtdNet,
    vsTarget,
    gpPercent,
    status: computeStatus(salesDeviation, gpPercent),
  };
}

// The Control Tower landing data: one tile per permitted Store, worst-first.
// Super-users get every Store; a store user gets only their own. Ordering is by
// status severity, then by the largest shortfall against target.
export const controlTower = query({
  args: {},
  handler: async (ctx) => {
    const stores = await getPermittedStores(ctx);
    const month = currentSastMonth();
    const tiles = await Promise.all(
      stores.map((store) => buildTile(ctx, store, month))
    );
    return tiles.sort((a, b) => {
      const rank = STATUS_RANK[b.status] - STATUS_RANK[a.status];
      if (rank !== 0) {
        return rank;
      }
      return (a.vsTarget ?? 0) - (b.vsTarget ?? 0);
    });
  },
});

// Sets a Store's monthly sales target (cents). Super-users only; a store user
// is rejected even for their own Store. The target drives every vs-target and
// status calculation on the Control Tower.
export const setSalesTarget = mutation({
  args: { storeId: v.id("stores"), salesTarget: v.number() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    if (!caller.superuser) {
      throw new Error("Only super-users may set a sales target");
    }
    await ctx.db.patch(args.storeId, { salesTarget: args.salesTarget });
  },
});
