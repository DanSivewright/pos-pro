"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { digestStoreValidator } from "./digestData";
import { renderDigestEmail } from "./emails/digestEmail";

const MAX_MEMBERS = 200;
const CLERK_API = "https://api.clerk.com/v1";
const RESEND_API = "https://api.resend.com/emails";

// Human SAST (Africa/Johannesburg) date label for the subject + brand bar,
// e.g. "26 June 2026".
function sastDateLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function digestSubject(dateLabel: string): string {
  return `Daily exception digest — ${dateLabel}`;
}

// The three env keys every send needs. Returned together so both the
// orchestrator and each fanned-out send can degrade to a logged no-op when the
// deployment has not yet configured email.
function emailEnv(): {
  clerkSecret: string;
  resendKey: string;
  from: string;
} | null {
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!(clerkSecret && resendKey && from)) {
    return null;
  }
  return { clerkSecret, resendKey, from };
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
    `/organizations/${orgId}/memberships?limit=${MAX_MEMBERS}`,
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
  const body = await clerkGet(`/users?limit=${MAX_MEMBERS}`, secret);
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
// digest for each Store's members via React Email, and sends them via Resend.
// Runs in the Node runtime because the React Email renderer uses
// react-dom/server. Degrades to a no-op log when the env keys are absent, so
// the cron never errors in a deployment that has not yet configured email. The
// per-Store CTA deep-links into the Control Tower when DIGEST_APP_URL is set.
export const send = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const env = emailEnv();
    if (env === null) {
      console.warn(
        "Digest skipped: missing CLERK_SECRET_KEY/RESEND_API_KEY/DIGEST_FROM_EMAIL"
      );
      return null;
    }
    const appUrl = process.env.DIGEST_APP_URL ?? null;

    const stores = await ctx.runQuery(internal.digestData.dataForDigest, {});
    const dateLabel = sastDateLabel();
    const subject = digestSubject(dateLabel);

    // The super-user consolidated digest is a single send, kept inline.
    const consolidated = await renderDigestEmail(stores, dateLabel, appUrl);
    const superRecipients = await superuserEmails(env.clerkSecret);
    await sendEmail(
      env.resendKey,
      env.from,
      superRecipients,
      subject,
      consolidated
    );

    // Fan the per-Store sends out: each becomes its own short action, so the
    // run no longer serialises N Clerk + Resend round-trips behind one another
    // (and one slow Store can't hold up the rest, nor trip the action time
    // limit). This orchestrator returns as soon as the sends are scheduled.
    for (const store of stores) {
      await ctx.scheduler.runAfter(0, internal.digest.sendOne, {
        store,
        dateLabel,
        appUrl,
      });
    }
    return null;
  },
});

// One Store's per-Store digest send, scheduled by `send`. Re-validates the
// email env (defensive — it was present when scheduled) and degrades to a
// logged no-op otherwise. A failed send is logged with the Store name on top of
// the recipient/status line `sendEmail` already records, so the failure is
// visible per Store in the Convex logs.
export const sendOne = internalAction({
  args: {
    store: digestStoreValidator,
    dateLabel: v.string(),
    appUrl: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (_ctx, { store, dateLabel, appUrl }) => {
    const env = emailEnv();
    if (env === null) {
      console.warn(
        `Digest send skipped for ${store.storeName}: missing email env`
      );
      return null;
    }
    const html = await renderDigestEmail([store], dateLabel, appUrl);
    const recipients = await orgMemberEmails(store.clerkOrgId, env.clerkSecret);
    const ok = await sendEmail(
      env.resendKey,
      env.from,
      recipients,
      digestSubject(dateLabel),
      html
    );
    if (!ok) {
      console.error(`Digest send failed for store ${store.storeName}`);
    }
    return null;
  },
});
