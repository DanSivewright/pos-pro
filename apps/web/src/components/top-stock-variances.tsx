"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { formatRand } from "@/lib/format";

// The largest stock variances on a Store Day, fetched per day so the list query
// stays a flat read. An over-usage (positive variance) is the worst offender.
export function TopStockVariances({
  storeDayId,
}: {
  storeDayId: Id<"storeDays">;
}) {
  const items = useQuery(api.storeDays.topStockVariances, { storeDayId });

  if (items === undefined || items.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-2 text-sm">
      {items.map((item) => (
        <li
          className="flex items-center justify-between gap-4"
          data-testid="variance-row"
          key={item.code}
        >
          <span className="truncate">
            {item.name}
            <span className="ml-2 text-muted-foreground text-xs">
              {item.category}
            </span>
          </span>
          <span
            className={
              item.variance < 0 ? "text-orange-600 dark:text-orange-400" : ""
            }
          >
            {formatRand(item.variance)} ({item.variancePercent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}
