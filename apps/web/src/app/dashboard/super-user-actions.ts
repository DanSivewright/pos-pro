"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCaller, isSuperuser } from "@/lib/superuser";

// Upper bound on the users scanned when enforcing the last-super-user guard.
// The operator population is tiny; if it ever outgrows this the guard would
// stop seeing every super-user, so revisit before that happens.
const USER_SCAN_LIMIT = 500;

const LAST_SUPERUSER = "At least one super-user must remain";

// Promotes or demotes a user's cross-org super-user access by writing the Clerk
// public metadata the session-token template mirrors. Gated and guarded
// server-side: the caller must already be a super-user, no one can demote
// themselves, and the last remaining super-user can't be removed.
export async function setSuperuser(
  targetUserId: string,
  next: boolean
): Promise<void> {
  const caller = await getCaller();
  if (!caller.isSuperuser) {
    throw new Error("Only super-users can change super-user access");
  }
  if (!next && targetUserId === caller.userId) {
    throw new Error("You can't remove your own super-user access");
  }

  const client = await clerkClient();

  if (!next) {
    // Best-effort guard against emptying the roster. Clerk's list is eventually
    // consistent, so two super-users demoting each other in the same instant can
    // still both pass — a benign, ~never event for a handful of operators, and
    // recoverable out-of-band by setting publicMetadata.superuser=true on anyone
    // in the Clerk dashboard. We deliberately do NOT chase it with a post-write
    // rollback: that relies on read-after-write consistency Clerk doesn't provide.
    // Rationale and rejected alternatives: docs/adr/0009.
    const { data } = await client.users.getUserList({ limit: USER_SCAN_LIMIT });
    const supers = data.filter(isSuperuser);
    if (supers.some((user) => user.id === targetUserId) && supers.length <= 1) {
      throw new Error(LAST_SUPERUSER);
    }
  }

  await client.users.updateUserMetadata(targetUserId, {
    publicMetadata: { superuser: next },
  });

  revalidatePath("/dashboard");
}
