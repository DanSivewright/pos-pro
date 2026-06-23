// Global exception thresholds (PRD §7). Stores share these constants; only the
// per-Store sales target is configurable. A Store Day's status is the worst of
// its available signals — sales-vs-target and GP% for the Control Tower.

export type Status = "green" | "amber" | "red";

// Sales: net-sales deviation from target. -10% Watch, -20% Critical.
const SALES_WATCH_DEVIATION = -0.1;
const SALES_CRITICAL_DEVIATION = -0.2;

// Gross profit: percentage points. <55% Watch, <50% Critical.
const GP_WATCH_PERCENT = 55;
const GP_CRITICAL_PERCENT = 50;

// Worst-first ordering: a higher rank is a worse Store.
export const STATUS_RANK: Record<Status, number> = {
  green: 0,
  amber: 1,
  red: 2,
};

function salesStatus(deviation: number | null): Status {
  if (deviation === null) {
    return "green";
  }
  if (deviation <= SALES_CRITICAL_DEVIATION) {
    return "red";
  }
  if (deviation <= SALES_WATCH_DEVIATION) {
    return "amber";
  }
  return "green";
}

function gpStatus(gpPercent: number | null): Status {
  if (gpPercent === null) {
    return "green";
  }
  if (gpPercent < GP_CRITICAL_PERCENT) {
    return "red";
  }
  if (gpPercent < GP_WATCH_PERCENT) {
    return "amber";
  }
  return "green";
}

// The Store Day status: the worse of the sales-vs-target and GP% signals. A
// null signal contributes nothing (treated as green). With no signals at all
// the Store is green.
export function computeStatus(
  salesDeviation: number | null,
  gpPercent: number | null
): Status {
  const sales = salesStatus(salesDeviation);
  const gp = gpStatus(gpPercent);
  return STATUS_RANK[sales] >= STATUS_RANK[gp] ? sales : gp;
}
