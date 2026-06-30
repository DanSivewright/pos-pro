// The subset of a Clerk user needed to derive a human display name, typed
// structurally so callers needn't depend on @clerk/backend directly.
export interface ClerkUserName {
  emailAddresses: { emailAddress: string; id: string }[];
  fullName: string | null;
  primaryEmailAddressId: string | null;
  username: string | null;
}

// A Clerk user's display name, preferring a real name, then a username, then
// the primary email. Returns undefined when none is set, so callers can fall
// back to an id.
export function resolveUserName(user: ClerkUserName): string | undefined {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return user.username;
  }
  const primary =
    user.emailAddresses.find(
      (entry) => entry.id === user.primaryEmailAddressId
    ) ?? user.emailAddresses[0];
  return primary?.emailAddress;
}
