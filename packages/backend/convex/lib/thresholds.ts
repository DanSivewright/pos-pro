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

// Cash variance: absolute deviation in cents. ≥R30 Watch, ≥R100 Critical.
const CASH_WATCH_CENTS = 3000;
const CASH_CRITICAL_CENTS = 10_000;

// Stock variance total: signed cents (loss is negative). −R100 Watch, −R300
// Critical.
const STOCK_WATCH_CENTS = -10_000;
const STOCK_CRITICAL_CENTS = -30_000;

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
  salesTarget: number | null
): Exception | null {
  if (netSales === null || salesTarget === null || salesTarget <= 0) {
    return null;
  }
  // Compare against integer-cents thresholds rather than the floating-point
  // deviation, so a Store exactly on the -10%/-20% line lands cleanly.
  if (netSales > salesTarget * (1 + SALES_WATCH_DEVIATION)) {
    return null;
  }
  const severity: Severity =
    netSales <= salesTarget * (1 + SALES_CRITICAL_DEVIATION)
      ? "critical"
      : "watch";
  const deviation = pct((netSales / salesTarget - 1) * 100, 1);
  return {
    metric: "sales",
    severity,
    message: `Net sales ${rand(netSales)} is ${deviation}% vs target ${rand(salesTarget)}`,
  };
}

function gpException(gpPercent: number | null): Exception | null {
  if (gpPercent === null || gpPercent >= GP_WATCH_PERCENT) {
    return null;
  }
  const severity: Severity =
    gpPercent < GP_CRITICAL_PERCENT ? "critical" : "watch";
  return {
    metric: "gp",
    severity,
    message: `Gross profit ${pct(gpPercent, 2)}% below ${GP_WATCH_PERCENT}%`,
  };
}

function cashException(cashVariance: number | null): Exception | null {
  if (cashVariance === null) {
    return null;
  }
  const magnitude = Math.abs(cashVariance);
  if (magnitude < CASH_WATCH_CENTS) {
    return null;
  }
  const severity: Severity =
    magnitude >= CASH_CRITICAL_CENTS ? "critical" : "watch";
  return {
    metric: "cash",
    severity,
    message: `Cash variance ${rand(cashVariance)}`,
  };
}

function stockException(stockVarianceTotal: number | null): Exception | null {
  if (stockVarianceTotal === null || stockVarianceTotal > STOCK_WATCH_CENTS) {
    return null;
  }
  const severity: Severity =
    stockVarianceTotal <= STOCK_CRITICAL_CENTS ? "critical" : "watch";
  return {
    metric: "stock",
    severity,
    message: `Stock variance ${rand(stockVarianceTotal)}`,
  };
}

// All threshold breaches on a Store Day, worst-first. A pure function over the
// day's figures: the same input always yields the same exceptions, so it can be
// exhaustively unit-tested at the boundaries.
export function computeExceptions(input: ExceptionInput): Exception[] {
  const candidates = [
    salesException(input.netSales, input.salesTarget),
    gpException(input.gpPercent),
    cashException(input.cashVariance),
    stockException(input.stockVarianceTotal),
  ];
  return candidates
    .filter((exception): exception is Exception => exception !== null)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
