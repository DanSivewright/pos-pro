import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseReportDate } from "./report-date";

const REFERENCE = join(process.cwd(), "../../docs/reference");
const RANGE_REJECTION = /Multi-day range reports/;

async function pdfText(relative: string): Promise<string> {
  const bytes = await readFile(join(REFERENCE, relative));
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("parseReportDate", () => {
  it("reads a single-day report's date", async () => {
    const text = await pdfText(
      "rp-sv-forms/Store_Cashup_From_07-06-2026_Printed_On_07-06-2026.pdf"
    );

    expect(parseReportDate(text)).toBe("2026-06-07");
  });

  it("rejects a multi-day range export rather than collapsing it to its start date", async () => {
    const text = await pdfText(
      "rp-first-batch/Royalty_From_01-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf"
    );

    expect(() => parseReportDate(text)).toThrow(RANGE_REJECTION);
  });

  it("reads the from date when only a From clause is present", () => {
    expect(parseReportDate("Report From Jun 7, 2026 Net Sales")).toBe(
      "2026-06-07"
    );
  });
});
