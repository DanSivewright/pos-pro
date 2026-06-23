import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseGrossProfit } from "./parse-gross-profit";

const REFERENCE_PDF = join(
  process.cwd(),
  "../../docs/reference/rp-first-batch/Gross_Profit_From_07-06-2026_To_07-06-2026_Printed_On_08-06-2026.pdf"
);

const WHITESPACE = /\s/;

async function referenceText(): Promise<string> {
  const bytes = await readFile(REFERENCE_PDF);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("parseGrossProfit", () => {
  it("extracts the summary GP%/FC%, net sales and stock-variance total", async () => {
    const text = await referenceText();

    const { date, gpPercent, fcPercent, netSales, stockVarianceTotal } =
      parseGrossProfit(text);

    expect(date).toBe("2026-06-07");
    expect(gpPercent).toBe(57.21);
    expect(fcPercent).toBe(42.79);
    expect(netSales).toBe(1_257_100);
    expect(stockVarianceTotal).toBe(6105);
  });

  it("extracts every per-item row, grouped by category", async () => {
    const text = await referenceText();

    const { items } = parseGrossProfit(text);

    expect(items).toHaveLength(152);
    expect(items.every((item) => item.code !== "")).toBe(true);
    expect(items.some((item) => WHITESPACE.test(item.code))).toBe(false);

    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
    expect(byCategory).toEqual({
      BOXES: 3,
      CHEESE: 3,
      "COFFEE&TEA": 9,
      CONSUMABLES: 2,
      DAIRY: 1,
      DESSERT: 3,
      DOUGH: 5,
      DRINKS: 10,
      DRYGOODS: 16,
      MEAT: 12,
      OIL: 4,
      PACKAGING: 27,
      POWDERS: 7,
      PREPPEDFOOD: 4,
      RETAIL: 3,
      SALADDRESSING: 2,
      SAUCE: 12,
      TINNEDGOODS: 6,
      TRAY: 15,
      VEGETABLES: 8,
    });
  });

  it("rejoins a multi-line item name to the cent", async () => {
    const text = await referenceText();

    const item = parseGrossProfit(text).items.find(
      (candidate) => candidate.code === "DMM004"
    );

    expect(item).toEqual({
      code: "DMM004",
      name: "Mozzarella Underberg / Bandini Mix",
      category: "CHEESE",
      actualCos: 166_908,
      theoreticalCos: 177_564,
      variance: 10_656,
      variancePercent: 6,
    });
  });

  it("rejoins an item code split across two lines", async () => {
    const text = await referenceText();

    const item = parseGrossProfit(text).items.find((candidate) =>
      candidate.code.startsWith("BIO")
    );

    expect(item?.code).toBe("BIO-STRN8CRDB");
    expect(item?.name).toBe("8mm BIOSTRAW");
  });

  it("reads negative and undefined-percentage rows", async () => {
    const text = await referenceText();
    const { items } = parseGrossProfit(text);

    const marinatedChicken = items.find((item) => item.code === "MMC003");
    expect(marinatedChicken).toEqual({
      code: "MMC003",
      name: "Marinated Chicken",
      category: "MEAT",
      actualCos: 85_715,
      theoreticalCos: 71_563,
      variance: -14_152,
      variancePercent: -19.78,
    });

    // "N/A" (a zero theoretical cost) carries through as a zero percentage.
    const olives = items.find((item) => item.code === "TSL007");
    expect(olives).toEqual({
      code: "TSL007",
      name: "Kalamata Sliced Olives",
      category: "TINNEDGOODS",
      actualCos: -24_896,
      theoreticalCos: 0,
      variance: 24_896,
      variancePercent: 0,
    });
  });
});
