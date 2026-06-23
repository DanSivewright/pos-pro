import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseRoyalty } from "./parse-royalty";

const REFERENCE_PDF = join(
  process.cwd(),
  "../../docs/reference/rp-first-batch/Royalty_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
);

async function referenceText(): Promise<string> {
  const bytes = await readFile(REFERENCE_PDF);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("parseRoyalty", () => {
  it("extracts the channel mix and royalty figures to the cent", async () => {
    const text = await referenceText();

    const result = parseRoyalty(text);

    expect(result).toEqual({
      date: "2026-06-07",
      channelMix: {
        callIn: 114_820,
        counter: 917_710,
        mobileApp: 11_380,
        mrDelivery: 213_190,
        uberEats: 0,
        website: 0,
      },
      netSales: 1_257_100,
      deliveryFees: 0,
      netTurnover: 1_093_130,
      tax: 163_970,
      royaltyDue: 100_568,
    });
  });

  it("computes a royalty due that is 8% of net sales", async () => {
    const text = await referenceText();

    const { netSales, royaltyDue } = parseRoyalty(text);

    expect(royaltyDue).toBe(Math.round((netSales * 8) / 100));
  });
});
