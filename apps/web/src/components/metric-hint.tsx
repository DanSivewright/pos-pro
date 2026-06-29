"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pos-pro/ui/components/tooltip";
import { Info } from "lucide-react";

// Plain-language explanations of every metric on the Control Tower and store
// drill-down, surfaced as hover/focus tooltips so the meaning lives in the app
// instead of in an onboarding doc.
export const METRIC_HINTS = {
  mtdNet:
    "Month-to-date net sales — this month's takings so far, after discounts and refunds.",
  target:
    "The store's monthly net-sales goal. The status colour is measured against it.",
  vsTarget:
    "How far ahead or behind the monthly target the store is pacing. Shown in red when behind.",
  gpPercent:
    "Gross profit %: the share of every R100 of sales left after ingredient costs. Higher is better — Watch under 55%, Critical under 50%.",
  status:
    "The store's health light — the worse of sales-vs-target and GP%. Green = on track, amber = watch, red = act now.",
  netSales: "Money earned from sales that day, after discounts and refunds.",
  cashVariance:
    "The till's expected cash versus what was actually counted at cashup. A negative figure means the drawer came up short.",
  royaltyDue:
    "The franchise fee owed to head office for the day — a fixed percentage of sales.",
  fcPercent:
    "Food cost %: ingredient cost as a share of sales. Lower is better, and roughly mirrors GP% (the two add up to about 100%).",
  wasteCost: "The rand value of stock thrown away that day. Lower is better.",
} as const;

export type MetricHintKey = keyof typeof METRIC_HINTS;

function MetricHint({ hint, label }: { hint: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`What ${label} means`}
        className="inline-flex items-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        type="button"
      >
        <Info aria-hidden="true" className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

// Renders a metric's label text followed by an info icon whose tooltip explains
// what the metric means.
export function MetricLabel({
  children,
  hintKey,
}: {
  children: string;
  hintKey: MetricHintKey;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <MetricHint hint={METRIC_HINTS[hintKey]} label={children} />
    </span>
  );
}
