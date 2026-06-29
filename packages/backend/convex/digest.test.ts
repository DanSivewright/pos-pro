// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

// digest.ts is a "use node" action that renders React Email (react-dom/server),
// so this suite runs in the node environment rather than the edge-runtime
// default used by the other convex-test suites.
const modules = import.meta.glob("./**/*.ts");

// Clerk + Resend are stubbed at the network boundary; the digest never reaches a
// real API. Empty data means no recipients, so the inline super-user send and
// any fanned-out send short-circuit before POSTing to Resend.
function stubEmailEnvAndFetch(): void {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("DIGEST_FROM_EMAIL", "alerts@example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    )
  );
}

async function seedStore(
  t: ReturnType<typeof convexTest>,
  name: string,
  clerkOrgId: string
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("stores", { name, clerkOrgId });
  });
}

async function scheduledJobs(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("send fans out one per-Store digest send per Store", async () => {
  const t = convexTest(schema, modules);
  stubEmailEnvAndFetch();
  await seedStore(t, "Roman's Pizza Boitumelo", "org_a");
  await seedStore(t, "Roman's Pizza Menlyn", "org_b");

  const result = await t.action(internal.digest.send, {});
  expect(result).toBeNull();

  const jobs = await scheduledJobs(t);
  expect(jobs).toHaveLength(2);
  expect(jobs.every((job) => job.name.includes("sendOne"))).toBe(true);
  // Each Store is carried to its own scheduled send.
  const storeNames = jobs
    .map(
      (job) => (job.args[0] as { store: { storeName: string } }).store.storeName
    )
    .sort();
  expect(storeNames).toEqual([
    "Roman's Pizza Boitumelo",
    "Roman's Pizza Menlyn",
  ]);
});

test("send is a logged no-op when the email env is missing", async () => {
  const t = convexTest(schema, modules);
  // No env stubbed, and explicitly clear the key the deployment would set.
  vi.stubEnv("CLERK_SECRET_KEY", "");
  await seedStore(t, "Roman's Pizza Boitumelo", "org_a");

  const result = await t.action(internal.digest.send, {});
  expect(result).toBeNull();

  const jobs = await scheduledJobs(t);
  expect(jobs).toHaveLength(0);
});
