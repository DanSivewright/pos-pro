import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseStockWastage } from "./parse-stock-wastage";

const REFERENCE_PDF = join(
  process.cwd(),
  "../../docs/reference/rp-sv-forms/Stock_Wastage_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
);

describe("parseStockWastage", () => {
  it("extracts the date and the grand total waste cost", async () => {
    const bytes = await readFile(REFERENCE_PDF);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });

    const { date, wasteCost } = parseStockWastage(text);

    expect(date).toBe("2026-06-07");
    expect(wasteCost).toBe(1324);
  });
});
