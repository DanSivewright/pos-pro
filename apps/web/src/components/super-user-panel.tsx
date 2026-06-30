import { clerkClient } from "@clerk/nextjs/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pos-pro/ui/components/card";
import { SuperUserSwitch } from "@/components/super-user-switch";
import { resolveUserName } from "@/lib/clerk-user";
import { getCaller, isSuperuser } from "@/lib/superuser";

// How many users the panel lists. The operator population is tiny; if it grows
// past this the list would silently truncate, so paginate before then.
const USER_LIST_LIMIT = 100;

interface UserRow {
  email: string | undefined;
  id: string;
  isSuperuser: boolean;
  name: string;
}

// Super-user-only panel for granting and revoking cross-org access. Renders
// nothing for everyone else, so it's safe to mount unconditionally. Users live
// in Clerk (auth is Clerk's domain), so this reads and writes Clerk directly
// rather than Convex.
export async function SuperUserPanel() {
  const caller = await getCaller();
  if (!caller.isSuperuser) {
    return null;
  }

  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    limit: USER_LIST_LIMIT,
    orderBy: "-created_at",
  });
  const rows: UserRow[] = data.map((user) => ({
    email: user.emailAddresses.find(
      (entry) => entry.id === user.primaryEmailAddressId
    )?.emailAddress,
    id: user.id,
    isSuperuser: isSuperuser(user),
    name: resolveUserName(user) ?? user.id,
  }));
  const superCount = rows.filter((row) => row.isSuperuser).length;

  return (
    <Card className="m-4 md:m-5" data-testid="superuser-panel">
      <CardHeader>
        <CardTitle>Super-users</CardTitle>
        <CardDescription>
          Grant or revoke cross-org access. Changes take effect on the user's
          next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.map((row) => {
          // Can't demote yourself, and the last super-user can't be removed —
          // either would risk locking everyone out.
          const isSelf = row.id === caller.userId;
          const isLastSuper = row.isSuperuser && superCount <= 1;
          return (
            <div
              className="flex items-center justify-between gap-3 border-border/60 border-b py-2 last:border-b-0"
              data-testid="superuser-row"
              key={row.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">
                  {row.name}
                  {isSelf && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      (you)
                    </span>
                  )}
                </p>
                {row.email && row.email !== row.name && (
                  <p className="truncate text-muted-foreground text-xs">
                    {row.email}
                  </p>
                )}
              </div>
              <SuperUserSwitch
                checked={row.isSuperuser}
                disabled={isSelf || isLastSuper}
                userId={row.id}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
