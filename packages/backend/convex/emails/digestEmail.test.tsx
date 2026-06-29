// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DigestStore } from "../lib/digest";
import type { ExceptionInput } from "../lib/thresholds";
import { renderDigestEmail } from "./digestEmail";

// The React Email renderer runs react-dom/server, which needs the Node runtime
// — hence the per-file environment override above (the suite defaults to the
// edge runtime for convex-test).

function cleanInput(): ExceptionInput {
  return {
    netSales: 100_000,
    salesTarget: 100_000,
    gpPercent: 60,
    cashVariance: 0,
    stockVarianceTotal: 0,
  };
}

const STORES: DigestStore[] = [
  { storeName: "Clean Store", input: cleanInput() },
  { storeName: "Watch Store", input: { ...cleanInput(), gpPercent: 54 } },
  { storeName: "Critical Store", input: { ...cleanInput(), gpPercent: 40 } },
];

const APP_URL = "https://pos.example.com";

describe("renderDigestEmail", () => {
  it("omits clean stores and leads with the worst", async () => {
    const html = await renderDigestEmail(STORES, "26 June 2026", APP_URL);
    expect(html).not.toContain("Clean Store");
    expect(html.indexOf("Critical Store")).toBeLessThan(
      html.indexOf("Watch Store")
    );
    expect(html).toContain("26 June 2026");
  });

  it("renders an all-clear when every store is clean", async () => {
    const html = await renderDigestEmail(
      [{ storeName: "Clean Store", input: cleanInput() }],
      "26 June 2026",
      APP_URL
    );
    expect(html).toContain("All clear");
    expect(html).not.toContain("Clean Store");
  });

  it("emits the Control Tower CTA only when an app URL is configured", async () => {
    const withCta = await renderDigestEmail(STORES, "26 June 2026", APP_URL);
    expect(withCta).toContain("View in Control Tower");
    expect(withCta).toContain(`${APP_URL}/dashboard`);

    const withoutCta = await renderDigestEmail(STORES, "26 June 2026", null);
    expect(withoutCta).not.toContain("View in Control Tower");
  });

  it("formats figures in polished ZAR with the indigo brand bar", async () => {
    const html = await renderDigestEmail(
      [
        {
          storeName: "Sandton City",
          input: {
            netSales: 900_000,
            salesTarget: 1_500_000,
            gpPercent: 48,
            cashVariance: 12_000,
            stockVarianceTotal: -35_000,
          },
        },
      ],
      "26 June 2026",
      APP_URL
    );
    // Space-grouped thousands + comma decimal, and the app-identity indigo.
    expect(html).toContain("R9\u00A0000,00");
    expect(html).toContain("R15\u00A0000,00");
    expect(html).toContain("48,00%");
    expect(html).toContain("#5B50E8");
  });
});
