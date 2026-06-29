// Exception thresholds (PRD §7). Each band has a global default below; a Store
// may override any band individually (see `stores` schema + `resolveThresholds`).
// A Store Day's status is the worst of its available signals — sales-vs-target
// and GP% for the Control Tower.

import { v } from "convex/values";

export type Status = "green" | "amber" | "red";

// The complete set of bands a status/exception calculation reasons over. Sales
// deviations are signed fractions (loss negative); GP is percent; cash/stock are
// signed cents (loss negative).
export interface Thresholds {
  cashCriticalCents: number;
  cashWatchCents: number;
  gpCriticalPercent: number;
  gpWatchPercent: number;
  salesCriticalDeviation: number;
  salesWatchDeviation: number;
  stockCriticalCents: number;
  stockWatchCents: number;
}

// The global defaults, applied to any Store that has not overridden a band.
// Sales: -10% Watch, -20% Critical. GP: <55% Watch, <50% Critical. Cash: ≥R30
// Watch, ≥R100 Critical. Stock: −R100 Watch, −R300 Critical.
export const DEFAULT_THRESHOLDS: Thresholds = {
  salesWatchDeviation: -0.1,
  salesCriticalDeviation: -0.2,
  gpWatchPercent: 55,
  gpCriticalPercent: 50,
  cashWatchCents: 3000,
  cashCriticalCents: 10_000,
  stockWatchCents: -10_000,
  stockCriticalCents: -30_000,
};

// Validator for a fully-resolved threshold set (every band present), used to
// carry resolved thresholds through the digest fan-out wire format.
export const thresholdsValidator = v.object({
  salesWatchDeviation: v.number(),
  salesCriticalDeviation: v.number(),
  gpWatchPercent: v.number(),
  gpCriticalPercent: v.number(),
  cashWatchCents: v.number(),
  cashCriticalCents: v.number(),
  stockWatchCents: v.number(),
  stockCriticalCents: v.number(),
});

// Merges a Store's per-band overrides over the global defaults, yielding a
// complete threshold set. Any band the Store leaves unset (undefined) falls back
// to its default, so a partial override is honoured band-by-band.
export function resolveThresholds(overrides: Partial<Thresholds>): Thresholds {
  return {
    salesWatchDeviation:
      overrides.salesWatchDeviation ?? DEFAULT_THRESHOLDS.salesWatchDeviation,
    salesCriticalDeviation:
      overrides.salesCriticalDeviation ??
      DEFAULT_THRESHOLDS.salesCriticalDeviation,
    gpWatchPercent:
      overrides.gpWatchPercent ?? DEFAULT_THRESHOLDS.gpWatchPercent,
    gpCriticalPercent:
      overrides.gpCriticalPercent ?? DEFAULT_THRESHOLDS.gpCriticalPercent,
    cashWatchCents:
      overrides.cashWatchCents ?? DEFAULT_THRESHOLDS.cashWatchCents,
    cashCriticalCents:
      overrides.cashCriticalCents ?? DEFAULT_THRESHOLDS.cashCriticalCents,
    stockWatchCents:
      overrides.stockWatchCents ?? DEFAULT_THRESHOLDS.stockWatchCents,
    stockCriticalCents:
      overrides.stockCriticalCents ?? DEFAULT_THRESHOLDS.stockCriticalCents,
  };
}

// Worst-first ordering: a higher rank is a worse Store.
export const STATUS_RANK: Record<Status, number> = {
  green: 0,
  amber: 1,
  red: 2,
};

function salesStatus(deviation: number | null, t: Thresholds): Status {
  if (deviation === null) {
    return "green";
  }
  if (deviation <= t.salesCriticalDeviation) {
    return "red";
  }
  if (deviation <= t.salesWatchDeviation) {
    return "amber";
  }
  return "green";
}

function gpStatus(gpPercent: number | null, t: Thresholds): Status {
  if (gpPercent === null) {
    return "green";
  }
  if (gpPercent < t.gpCriticalPercent) {
    return "red";
  }
  if (gpPercent < t.gpWatchPercent) {
    return "amber";
  }
  return "green";
}

// The Store Day status: the worse of the sales-vs-target and GP% signals. A
// null signal contributes nothing (treated as green). With no signals at all
// the Store is green. Thresholds default to the globals when not supplied.
export function computeStatus(
  salesDeviation: number | null,
  gpPercent: number | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Status {
  const sales = salesStatus(salesDeviation, thresholds);
  const gp = gpStatus(gpPercent, thresholds);
  return STATUS_RANK[sales] >= STATUS_RANK[gp] ? sales : gp;
}

// An exception is a single threshold breach on a Store Day. The digest groups
// these per Store; severity drives the colour and worst-first ordering.
export type Severity = "watch" | "critical";

export interface Exception {
  message: string;
  metric: "sales" | "gp" | "cash" | "stock";
  severity: Severity;
}

// The figures the digest reasons over, read from the latest Store Day. Any may
// be absent (the report-type that owns it has not landed); an absent figure
// raises no exception.
export interface ExceptionInput {
  cashVariance: number | null;
  gpPercent: number | null;
  netSales: number | null;
  salesTarget: number | null;
  stockVarianceTotal: number | null;
}

// Worse-first ordering for severities within and across Stores.
export const SEVERITY_RANK: Record<Severity, number> = {
  watch: 1,
  critical: 2,
};

// Groups the integer part into threes for the thousands separator.
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

// South African Rand from integer cents in the local convention: space-grouped
// thousands and a comma decimal, e.g. 900_000 -> "R9 000,00", -35_000 ->
// "-R350,00". The grouping space is non-breaking so a figure never wraps
// mid-number in an email client.
function rand(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(cents) / 100);
  const frac = (Math.abs(cents) % 100).toString().padStart(2, "0");
  const grouped = whole.toString().replace(THOUSANDS, "\u00A0");
  return `${sign}R${grouped},${frac}`;
}

// A percentage with a comma decimal, matching the Rand convention, e.g.
// pct(-40, 1) -> "-40,0", pct(48, 2) -> "48,00".
function pct(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",");
}

function salesException(
  netSales: number | null,
  salesTarget: number | null,
  t: Thresholds
): Exception | null {
  if (netSales === null || salesTarget === null || salesTarget <= 0) {
    return null;
  }
  // Compare against integer-cents thresholds rather than the floating-point
  // deviation, so a Store exactly on the Watch/Critical line lands cleanly.
  if (netSales > salesTarget * (1 + t.salesWatchDeviation)) {
    return null;
  }
  const severity: Severity =
    netSales <= salesTarget * (1 + t.salesCriticalDeviation)
      ? "critical"
      : "watch";
  const deviation = pct((netSales / salesTarget - 1) * 100, 1);
  return {
    metric: "sales",
    severity,
    message: `Net sales ${rand(netSales)} is ${deviation}% vs target ${rand(salesTarget)}`,
  };
}

function gpException(
  gpPercent: number | null,
  t: Thresholds
): Exception | null {
  if (gpPercent === null || gpPercent >= t.gpWatchPercent) {
    return null;
  }
  const severity: Severity =
    gpPercent < t.gpCriticalPercent ? "critical" : "watch";
  return {
    metric: "gp",
    severity,
    message: `Gross profit ${pct(gpPercent, 2)}% below ${t.gpWatchPercent}%`,
  };
}

function cashException(
  cashVariance: number | null,
  t: Thresholds
): Exception | null {
  if (cashVariance === null) {
    return null;
  }
  const magnitude = Math.abs(cashVariance);
  if (magnitude < t.cashWatchCents) {
    return null;
  }
  const severity: Severity =
    magnitude >= t.cashCriticalCents ? "critical" : "watch";
  return {
    metric: "cash",
    severity,
    message: `Cash variance ${rand(cashVariance)}`,
  };
}

function stockException(
  stockVarianceTotal: number | null,
  t: Thresholds
): Exception | null {
  if (stockVarianceTotal === null || stockVarianceTotal > t.stockWatchCents) {
    return null;
  }
  const severity: Severity =
    stockVarianceTotal <= t.stockCriticalCents ? "critical" : "watch";
  return {
    metric: "stock",
    severity,
    message: `Stock variance ${rand(stockVarianceTotal)}`,
  };
}

// All threshold breaches on a Store Day, worst-first. A pure function over the
// day's figures: the same input always yields the same exceptions, so it can be
// exhaustively unit-tested at the boundaries. Thresholds default to the globals
// when not supplied.
export function computeExceptions(
  input: ExceptionInput,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Exception[] {
  const candidates = [
    salesException(input.netSales, input.salesTarget, thresholds),
    gpException(input.gpPercent, thresholds),
    cashException(input.cashVariance, thresholds),
    stockException(input.stockVarianceTotal, thresholds),
  ];
  return candidates
    .filter((exception): exception is Exception => exception !== null)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
