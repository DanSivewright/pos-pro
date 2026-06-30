"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCaller } from "@/lib/superuser";

// Upper bound on the users scanned when enforcing the last-super-user guard.
// The operator population is tiny; if it ever outgrows this the guard would
// stop seeing every super-user, so revisit before that happens.
const USER_SCAN_LIMIT = 500;

const LAST_SUPERUSER = "At least one super-user must remain";

type Client = Awaited<ReturnType<typeof clerkClient>>;

// The ids of every current super-user, read fresh from Clerk (the source of
// truth) so the last-super-user guard never trusts a cached count.
async function superuserIds(client: Client): Promise<Set<string>> {
  const { data } = await client.users.getUserList({ limit: USER_SCAN_LIMIT });
  return new Set(
    data
      .filter((user) => user.publicMetadata?.superuser === true)
      .map((user) => user.id)
  );
}

// Promotes or demotes a user's cross-org super-user access by writing the Clerk
// public metadata the session-token template mirrors. Gated and guarded
// server-side: the caller must already be a super-user, no one can demote
// themselves, and the last remaining super-user can't be removed.
//
// The last-super-user guard is checked twice — before and after the write — so
// two super-users demoting each other at once can't both slip past a stale
// count and empty the roster: whoever's write lands second re-counts, sees
// zero, and rolls its own demote back. So the system self-heals to >=1 super.
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
  let targetWasSuper = false;
  if (!next) {
    const supers = await superuserIds(client);
    targetWasSuper = supers.has(targetUserId);
    if (targetWasSuper && supers.size <= 1) {
      throw new Error(LAST_SUPERUSER);
    }
  }

  await client.users.updateUserMetadata(targetUserId, {
    publicMetadata: { superuser: next },
  });

  if (!next && targetWasSuper && (await superuserIds(client)).size === 0) {
    // A concurrent demote raced us to zero between the pre-check and our write;
    // undo this demote so at least one super-user always survives.
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: { superuser: true },
    });
    throw new Error(LAST_SUPERUSER);
  }

  revalidatePath("/dashboard");
}
