import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireCaller } from "./lib/authz";

// Per-org ceiling on upload batches. One POST to /api/upload consumes one token;
// a batch may carry many files, so this bounds upload *actions*, not files. A
// token bucket (vs a fixed window) lets a store fire a short burst — e.g. the
// day's reports in quick succession — while holding the sustained rate at 20/min.
// Capacity == rate, so the bucket refills fully within a minute and an idle store
// always has its full allowance. Generous for any human workflow; a runaway
// script or abusive client hits the wall. State lives in Convex (the source of
// truth), so the limit holds across every stateless Vercel function instance.
const rateLimiter = new RateLimiter(components.rateLimiter, {
  uploadBatch: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 },
});

// Consumes one upload token for the caller's active org and reports whether the
// request may proceed. The org key is derived server-side from the Clerk session
// — never from caller input — so a client cannot spend another org's allowance.
// `retryAfter` is milliseconds until a token frees up (0 when allowed).
export const checkUpload = mutation({
  args: {},
  returns: v.object({ ok: v.boolean(), retryAfter: v.number() }),
  handler: async (ctx) => {
    const { orgId } = await requireCaller(ctx);
    if (orgId === null) {
      throw new Error("No active organization");
    }
    const status = await rateLimiter.limit(ctx, "uploadBatch", { key: orgId });
    return { ok: status.ok, retryAfter: status.retryAfter ?? 0 };
  },
});
