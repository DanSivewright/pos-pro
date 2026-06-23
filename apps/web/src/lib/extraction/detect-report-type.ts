/**
 * Identifies which ServeUp report a block of extracted text is, by its title
 * header. Returns null when nothing matches so the caller can mark the file
 * unsupported. Only Cashup is parsed today; the rest are recognised so the
 * upload pipeline can route and report them honestly.
 */
export type ReportType =
  | "cashup"
  | "royalty"
  | "grossProfit"
  | "stockVariance"
  | "stockWastage";

const SIGNATURES: { marker: string; type: ReportType }[] = [
  { marker: "Store Cashup Report", type: "cashup" },
  { marker: "Royalty", type: "royalty" },
  { marker: "Gross Profit", type: "grossProfit" },
  { marker: "Stock Variance", type: "stockVariance" },
  { marker: "Stock Wastage", type: "stockWastage" },
];

export function detectReportType(text: string): ReportType | null {
  for (const { marker, type } of SIGNATURES) {
    if (text.includes(marker)) {
      return type;
    }
  }
  return null;
}
