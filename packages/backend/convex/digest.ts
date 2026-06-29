import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { type DigestStore, renderDigest } from "./lib/digest";

const MAX_STORES = 200;
const CLERK_API = "https://api.clerk.com/v1";
const RESEND_API = "https://api.resend.com/emails";

// The latest Store Day per Store, flattened to the figures the digest reasons
// over. Internal: the cron runs it with no caller, so it is never store-scoped
// — it deliberately reads every Store to build the super-user's consolidated
// view and each Store's own section.
export const dataForDigest = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      storeName: v.string(),
      clerkOrgId: v.string(),
      input: v.object({
        netSales: v.union(v.number(), v.null()),
        salesTarget: v.union(v.number(), v.null()),
        gpPercent: v.union(v.number(), v.null()),
        cashVariance: v.union(v.number(), v.null()),
        stockVarianceTotal: v.union(v.number(), v.null()),
      }),
    })
  ),
  handler: async (ctx) => {
    const stores = await ctx.db.query("stores").take(MAX_STORES);
    const rows = await Promise.all(
      stores.map(async (store) => {
        const latest = await ctx.db
          .query("storeDays")
          .withIndex("by_storeId_and_date", (q) => q.eq("storeId", store._id))
          .order("desc")
          .first();
        return {
          storeName: store.name,
          clerkOrgId: store.clerkOrgId,
          input: {
            netSales: latest?.netSales ?? null,
            salesTarget: store.salesTarget ?? null,
            gpPercent: latest?.gpPercent ?? null,
            cashVariance: latest?.cashVariance ?? null,
            stockVarianceTotal: latest?.stockVarianceTotal ?? null,
          },
        };
      })
    );
    return rows;
  },
});

// SAST (UTC+2) calendar date label for the digest header.
function sastDateLabel(): string {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function clerkGet(
  path: string,
  secret: string
): Promise<{ data?: unknown[] }> {
  const response = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as { data?: unknown[] };
}

// The member emails of one Clerk organization.
async function orgMemberEmails(
  orgId: string,
  secret: string
): Promise<string[]> {
  const body = await clerkGet(
    `/organizations/${orgId}/memberships?limit=${MAX_STORES}`,
    secret
  );
  const emails: string[] = [];
  for (const membership of body.data ?? []) {
    const identifier = (
      membership as { public_user_data?: { identifier?: string } }
    ).public_user_data?.identifier;
    if (typeof identifier === "string") {
      emails.push(identifier);
    }
  }
  return emails;
}

// The emails of every super-user (publicMetadata.superuser === true).
async function superuserEmails(secret: string): Promise<string[]> {
  const body = await clerkGet(`/users?limit=${MAX_STORES}`, secret);
  const emails: string[] = [];
  for (const user of body.data ?? []) {
    const typed = user as {
      public_metadata?: { superuser?: boolean };
      email_addresses?: { email_address?: string }[];
    };
    if (typed.public_metadata?.superuser !== true) {
      continue;
    }
    const email = typed.email_addresses?.[0]?.email_address;
    if (typeof email === "string") {
      emails.push(email);
    }
  }
  return emails;
}

// Sends one digest email via Resend. Returns true on success (or when there are
// no recipients to send to). On failure it reads Resend's error body and logs
// it with the recipient list + status so a rejected send is visible in the
// Convex logs (`mcp__convex__logs status:"failure"`) instead of vanishing.
async function sendEmail(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string
): Promise<boolean> {
  if (to.length === 0) {
    return true;
  }
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(
      `Digest send failed (${response.status}) to ${to.join(", ")}: ${body}`
    );
    return false;
  }
  return true;
}

// The daily exception digest. Triggered by the cron. Reads every Store's latest
// figures, renders the consolidated digest for super-users and a per-Store
// digest for each Store's members, and sends them via Resend. Degrades to a
// no-op log when the env keys are absent, so the cron never errors in a
// deployment that has not yet configured email.
export const send = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.DIGEST_FROM_EMAIL;
    if (!(clerkSecret && resendKey && from)) {
      console.warn(
        "Digest skipped: missing CLERK_SECRET_KEY/RESEND_API_KEY/DIGEST_FROM_EMAIL"
      );
      return null;
    }

    const stores = await ctx.runQuery(internal.digest.dataForDigest, {});
    const dateLabel = sastDateLabel();
    const subject = `Daily exception digest — ${dateLabel}`;

    let failures = 0;

    const consolidated = renderDigest(stores as DigestStore[], dateLabel);
    const superRecipients = await superuserEmails(clerkSecret);
    const superOk = await sendEmail(
      resendKey,
      from,
      superRecipients,
      subject,
      consolidated
    );
    if (!superOk) {
      failures += 1;
    }

    for (const store of stores) {
      const html = renderDigest([store as DigestStore], dateLabel);
      const recipients = await orgMemberEmails(store.clerkOrgId, clerkSecret);
      const ok = await sendEmail(resendKey, from, recipients, subject, html);
      if (!ok) {
        failures += 1;
      }
    }

    if (failures > 0) {
      console.error(
        `Digest run completed with ${failures} failed send(s) — see errors above`
      );
    }
    return null;
  },
});
