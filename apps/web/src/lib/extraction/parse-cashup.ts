import { MONEY, matchMoney, parseMoney } from "./money";
import { parseReportDate } from "./report-date";

/**
 * Parses the text of a ServeUp "Store Cashup" report into the Cashup-owned
 * Store Day figures. All money is returned as integer cents; the date is a
 * YYYY-MM-DD string (Africa/Johannesburg, the report's own local date).
 *
 * The report is one Store on one day, so it yields exactly one date. Input is
 * the flat text produced by unpdf (single space-joined string, no newlines).
 */
export interface CashupExtract {
  cardVariance: number;
  cashVariance: number;
  date: string;
  discounts: number;
  grossSales: number;
  netSales: number;
  refunds: number;
  tips: number;
  voids: number;
}

export function parseCashup(text: string): CashupExtract {
  const variances = text.match(
    new RegExp(`Reconciled variances\\s+${MONEY}\\s+${MONEY}`)
  );
  if (variances === null) {
    throw new Error(
      'Cashup parse failed: could not find "Reconciled variances"'
    );
  }

  return {
    date: parseReportDate(text),
    grossSales: matchMoney(
      text,
      "Gross Sales",
      new RegExp(`Gross Sales\\s+${MONEY}`)
    ),
    discounts: matchMoney(
      text,
      "Discounts",
      new RegExp(`Discounts\\s+${MONEY}`)
    ),
    refunds: matchMoney(text, "Refunds", new RegExp(`Refunds\\s+${MONEY}`)),
    voids: matchMoney(text, "Voids", new RegExp(`Voids\\s+${MONEY}`)),
    netSales: matchMoney(
      text,
      "Net Sales",
      new RegExp(`Net Sales\\s+${MONEY}`)
    ),
    tips: matchMoney(text, "Tips", new RegExp(`(?<!incl )Tips\\s+${MONEY}`)),
    cashVariance: parseMoney(variances[1]),
    cardVariance: parseMoney(variances[2]),
  };
}
