import { auth, clerkClient } from "@clerk/nextjs/server";

export interface Caller {
  isSuperuser: boolean;
  userId: string | null;
}

// Resolves the signed-in caller and whether they hold cross-org super-user
// access. The flag is read from Clerk public metadata server-side — the source
// of truth the session-token template mirrors — never from a client-supplied
// value or a token claim a caller could shape. Returns isSuperuser=false when
// signed out, so callers can gate on it directly.
export async function getCaller(): Promise<Caller> {
  const { userId } = await auth();
  if (!userId) {
    return { isSuperuser: false, userId: null };
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return { isSuperuser: user.publicMetadata?.superuser === true, userId };
}
