"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCaller } from "@/lib/superuser";

// Upper bound on the users scanned when enforcing the last-super-user guard.
// The operator population is tiny; if it ever outgrows this the guard would
// stop seeing every super-user, so revisit before that happens.
const USER_SCAN_LIMIT = 500;

// Promotes or demotes a user's cross-org super-user access by writing the Clerk
// public metadata the session-token template mirrors. Gated and guarded
// server-side: the caller must already be a super-user, no one can demote
// themselves, and the last remaining super-user can't be removed — so the app
// can never be left with zero operators.
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
    const { data } = await client.users.getUserList({
      limit: USER_SCAN_LIMIT,
    });
    const supers = data.filter(
      (user) => user.publicMetadata?.superuser === true
    );
    const targetIsSuper = supers.some((user) => user.id === targetUserId);
    if (targetIsSuper && supers.length <= 1) {
      throw new Error("At least one super-user must remain");
    }
  }

  await client.users.updateUserMetadata(targetUserId, {
    publicMetadata: { superuser: next },
  });
  revalidatePath("/dashboard");
}
