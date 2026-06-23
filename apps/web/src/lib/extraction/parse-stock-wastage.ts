import { MONEY, matchMoney } from "./money";
import { parseReportDate } from "./report-date";

/**
 * Parses the text of a ServeUp "Stock Wastage" report. It contributes the
 * day's total waste cost (the report's Grand Total) to the Store Day. Money is
 * integer cents; the date is YYYY-MM-DD. Input is the flat text from unpdf.
 */
export interface StockWastageExtract {
  date: string;
  wasteCost: number;
}

const GRAND_TOTAL = new RegExp(`Grand Total\\s+${MONEY}`);

export function parseStockWastage(text: string): StockWastageExtract {
  return {
    date: parseReportDate(text),
    wasteCost: matchMoney(text, "Grand Total", GRAND_TOTAL),
  };
}
