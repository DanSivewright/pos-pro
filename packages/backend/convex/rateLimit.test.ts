import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function withRateLimiter(): ReturnType<typeof convexTest> {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

const CAPACITY = 20;
const NO_ACTIVE_ORG = /active organization/;

describe("rateLimit.checkUpload", () => {
  it("allows up to the per-org capacity then refuses with a retryAfter", async () => {
    const t = withRateLimiter().withIdentity({
      subject: "user_1",
      org_id: "org_1",
    });

    for (let i = 0; i < CAPACITY; i++) {
      const status = await t.mutation(api.rateLimit.checkUpload, {});
      expect(status.ok).toBe(true);
    }

    const blocked = await t.mutation(api.rateLimit.checkUpload, {});
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keys the limit per org — one org's exhaustion does not block another", async () => {
    const t = withRateLimiter();
    const orgA = t.withIdentity({ subject: "user_a", org_id: "org_a" });
    const orgB = t.withIdentity({ subject: "user_b", org_id: "org_b" });

    for (let i = 0; i < CAPACITY; i++) {
      await orgA.mutation(api.rateLimit.checkUpload, {});
    }
    expect((await orgA.mutation(api.rateLimit.checkUpload, {})).ok).toBe(false);

    // org_b has its own untouched bucket.
    expect((await orgB.mutation(api.rateLimit.checkUpload, {})).ok).toBe(true);
  });

  it("rejects a caller with no active org", async () => {
    const t = withRateLimiter().withIdentity({ subject: "user_1" });
    await expect(t.mutation(api.rateLimit.checkUpload, {})).rejects.toThrow(
      NO_ACTIVE_ORG
    );
  });
});
