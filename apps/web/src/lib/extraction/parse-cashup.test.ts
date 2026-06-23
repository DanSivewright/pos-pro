import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseCashup } from "./parse-cashup";

const REFERENCE_PDF = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Store_Cashup_From_07-06-2026_Printed_On_07-06-2026.pdf"
);

async function referenceText(): Promise<string> {
  const bytes = await readFile(REFERENCE_PDF);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("parseCashup", () => {
  it("extracts every Cashup figure from the reference PDF to the cent", async () => {
    const text = await referenceText();

    const result = parseCashup(text);

    expect(result).toEqual({
      date: "2026-06-07",
      grossSales: 1_266_090,
      discounts: 8990,
      refunds: 0,
      voids: 0,
      netSales: 1_257_100,
      tips: 0,
      cashVariance: -14_550,
      cardVariance: 14_550,
    });
  });
});
