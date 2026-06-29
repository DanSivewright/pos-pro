import { describe, expect, it } from "vitest";
import { buildSections, type DigestStore } from "./digest";
import {
  computeExceptions,
  computeStatus,
  DEFAULT_THRESHOLDS,
  type ExceptionInput,
  resolveThresholds,
  type Severity,
} from "./thresholds";

// A clean day: net sales on target, healthy GP, no cash or stock variance.
function cleanInput(): ExceptionInput {
  return {
    netSales: 100_000,
    salesTarget: 100_000,
    gpPercent: 60,
    cashVariance: 0,
    stockVarianceTotal: 0,
  };
}

function metrics(input: ExceptionInput): Record<string, Severity> {
  const out: Record<string, Severity> = {};
  for (const exception of computeExceptions(input)) {
    out[exception.metric] = exception.severity;
  }
  return out;
}

describe("computeExceptions", () => {
  it("raises nothing for a clean day", () => {
    expect(computeExceptions(cleanInput())).toEqual([]);
  });

  it("flags sales watch at exactly -10% and critical at -20%", () => {
    const watch = metrics({
      ...cleanInput(),
      netSales: 90_000,
      salesTarget: 100_000,
    });
    expect(watch.sales).toBe("watch");
    const critical = metrics({
      ...cleanInput(),
      netSales: 80_000,
      salesTarget: 100_000,
    });
    expect(critical.sales).toBe("critical");
  });

  it("does not flag sales just inside -10%", () => {
    const ok = metrics({
      ...cleanInput(),
      netSales: 90_001,
      salesTarget: 100_000,
    });
    expect(ok.sales).toBeUndefined();
  });

  it("raises no sales exception without a target", () => {
    const ok = metrics({ ...cleanInput(), salesTarget: null, netSales: 1 });
    expect(ok.sales).toBeUndefined();
  });

  it("flags GP watch below 55 and critical below 50", () => {
    expect(metrics({ ...cleanInput(), gpPercent: 54.99 }).gp).toBe("watch");
    expect(metrics({ ...cleanInput(), gpPercent: 55 }).gp).toBeUndefined();
    expect(metrics({ ...cleanInput(), gpPercent: 49.99 }).gp).toBe("critical");
    expect(metrics({ ...cleanInput(), gpPercent: 50 }).gp).toBe("watch");
  });

  it("flags cash watch at ±R30 and critical at ±R100", () => {
    expect(metrics({ ...cleanInput(), cashVariance: 3000 }).cash).toBe("watch");
    expect(
      metrics({ ...cleanInput(), cashVariance: 2999 }).cash
    ).toBeUndefined();
    expect(metrics({ ...cleanInput(), cashVariance: -10_000 }).cash).toBe(
      "critical"
    );
  });

  it("flags stock watch at -R100 and critical at -R300", () => {
    expect(
      metrics({ ...cleanInput(), stockVarianceTotal: -10_000 }).stock
    ).toBe("watch");
    expect(
      metrics({ ...cleanInput(), stockVarianceTotal: -9999 }).stock
    ).toBeUndefined();
    expect(
      metrics({ ...cleanInput(), stockVarianceTotal: -30_000 }).stock
    ).toBe("critical");
  });

  it("orders a day's exceptions worst-first", () => {
    const exceptions = computeExceptions({
      netSales: 90_000,
      salesTarget: 100_000,
      gpPercent: 40,
      cashVariance: 0,
      stockVarianceTotal: 0,
    });
    expect(exceptions[0].severity).toBe("critical");
    expect(exceptions.at(-1)?.severity).toBe("watch");
  });

  it("honors per-store threshold overrides over the defaults", () => {
    const day = { ...cleanInput(), gpPercent: 54 };
    // GP 54 is a watch under the default 55/50; a stricter override makes it
    // critical, and a looser one clears it entirely.
    const stricter = computeExceptions(
      day,
      resolveThresholds({ gpWatchPercent: 60, gpCriticalPercent: 56 })
    );
    expect(stricter.find((e) => e.metric === "gp")?.severity).toBe("critical");

    const looser = computeExceptions(
      day,
      resolveThresholds({ gpWatchPercent: 50 })
    );
    expect(looser.find((e) => e.metric === "gp")).toBeUndefined();
  });

  it("falls back to the default for any band an override omits", () => {
    // Only the GP critical band is overridden; the watch band still defaults to
    // 55, so GP 54 stays a watch rather than disappearing.
    const result = computeExceptions(
      { ...cleanInput(), gpPercent: 54 },
      resolveThresholds({ gpCriticalPercent: 40 })
    );
    expect(result.find((e) => e.metric === "gp")?.severity).toBe("watch");
  });
});

describe("computeStatus", () => {
  it("uses the global defaults when no thresholds are supplied", () => {
    expect(computeStatus(null, 54)).toBe("amber");
    expect(computeStatus(null, 49)).toBe("red");
    expect(computeStatus(null, 60)).toBe("green");
  });

  it("honors a per-store GP override, falling back per band", () => {
    // A stricter watch band (60) turns a GP of 58 amber where the default would
    // have read green; the critical band falls back to the default 50.
    const stricter = resolveThresholds({ gpWatchPercent: 60 });
    expect(computeStatus(null, 58, stricter)).toBe("amber");
    expect(computeStatus(null, 49, stricter)).toBe("red");
  });
});

const STORES: DigestStore[] = [
  {
    storeName: "Clean Store",
    input: cleanInput(),
    thresholds: DEFAULT_THRESHOLDS,
  },
  {
    storeName: "Watch Store",
    input: { ...cleanInput(), gpPercent: 54 },
    thresholds: DEFAULT_THRESHOLDS,
  },
  {
    storeName: "Critical Store",
    input: { ...cleanInput(), gpPercent: 40 },
    thresholds: DEFAULT_THRESHOLDS,
  },
];

describe("buildSections", () => {
  it("hides clean stores and orders worst-first", () => {
    const sections = buildSections(STORES);
    expect(sections.map((s) => s.storeName)).toEqual([
      "Critical Store",
      "Watch Store",
    ]);
  });

  it("derives each section's severity from its worst exception", () => {
    const [critical, watch] = buildSections(STORES);
    expect(critical.severity).toBe("critical");
    expect(watch.severity).toBe("watch");
  });
});
