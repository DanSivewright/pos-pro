import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseStockVariance } from "./parse-stock-variance";

const REFERENCE_PDF = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Stock_Variance_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
);

const WHITESPACE = /\s/;

async function referenceText(): Promise<string> {
  const bytes = await readFile(REFERENCE_PDF);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("parseStockVariance", () => {
  it("extracts the date and grand variance total", async () => {
    const text = await referenceText();

    const { date, stockVarianceTotal } = parseStockVariance(text);

    expect(date).toBe("2026-06-07");
    expect(stockVarianceTotal).toBe(-24_412);
  });

  it("extracts every per-item row, grouped by category", async () => {
    const text = await referenceText();

    const { items } = parseStockVariance(text);

    expect(items).toHaveLength(201);
    expect(items.every((item) => item.code !== "")).toBe(true);
    expect(items.some((item) => WHITESPACE.test(item.code))).toBe(false);

    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
    expect(byCategory).toEqual({
      Boxes: 3,
      Cheese: 3,
      Cleaning: 22,
      "Coffee&Tea": 9,
      Consumables: 2,
      Dairy: 1,
      Dessert: 3,
      Dough: 5,
      Drinks: 10,
      DryGoods: 17,
      Equipment: 1,
      Meat: 12,
      Miscellaneous: 2,
      Oil: 4,
      Packaging: 51,
      Powders: 7,
      Preppedfood: 5,
      Retail: 5,
      SaladDressing: 2,
      Sauce: 13,
      StaffGoods: 4,
      Stationery: 5,
      TinnedGoods: 6,
      Uniform: 1,
      Vegetables: 8,
    });
  });

  it("reads the money variance value and percentage of a row", async () => {
    const text = await referenceText();
    const { items } = parseStockVariance(text);

    expect(items.find((item) => item.code === "DMM004")).toEqual({
      code: "DMM004",
      name: "Mozzarella Underberg / Bandini Mix",
      category: "Cheese",
      variance: 10_656,
      variancePercent: 5.98,
    });

    expect(items.find((item) => item.code === "CFC001")).toEqual({
      code: "CFC001",
      name: "Feta",
      category: "Cheese",
      variance: -1226,
      variancePercent: -18.33,
    });
  });

  it("reads a negative-quantity row whose variance value is positive", async () => {
    const text = await referenceText();

    const olives = parseStockVariance(text).items.find(
      (item) => item.code === "TSL007"
    );

    expect(olives).toEqual({
      code: "TSL007",
      name: "Kalamata Sliced Olives",
      category: "TinnedGoods",
      variance: 24_896,
      variancePercent: 0,
    });
  });

  it("rejoins an item code split across two lines", async () => {
    const text = await referenceText();

    const item = parseStockVariance(text).items.find((candidate) =>
      candidate.code.startsWith("FG-")
    );

    expect(item?.code).toBe("FG-HB001-001");
  });
});
