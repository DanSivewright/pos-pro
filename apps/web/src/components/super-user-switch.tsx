"use client";

import { Switch } from "@pos-pro/ui/components/switch";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setSuperuser } from "@/app/dashboard/super-user-actions";

// The interactive control for one user's super-user access. Flips optimistically
// so the toggle feels instant; useOptimistic derives FROM the server prop, so
// revalidation re-syncs it automatically and a rejected action reverts when the
// transition ends — no local copy to go stale, no remount needed to re-seed it.
// The server is always the authority — this state is presentation only.
export function SuperUserSwitch({
  userId,
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
  userId: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [isPending, startTransition] = useTransition();

  function onCheckedChange(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      try {
        await setSuperuser(userId, next);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn't update super-user access"
        );
      }
    });
  }

  return (
    <Switch
      checked={optimistic}
      data-testid="superuser-switch"
      disabled={disabled || isPending}
      onCheckedChange={onCheckedChange}
    />
  );
}
