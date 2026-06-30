"use client";

import { Switch } from "@pos-pro/ui/components/switch";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSuperuser } from "@/app/dashboard/super-user-actions";

// The interactive control for one user's super-user access. Flips optimistically
// so the toggle feels instant, then reverts and surfaces the reason if the
// server action rejects (e.g. last-super-user guard). The server is always the
// authority — this state is presentation only.
export function SuperUserSwitch({
  userId,
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
  userId: string;
}) {
  const [optimistic, setOptimistic] = useState(checked);
  const [isPending, startTransition] = useTransition();

  function onCheckedChange(next: boolean) {
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setSuperuser(userId, next);
      } catch (error) {
        setOptimistic(!next);
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
