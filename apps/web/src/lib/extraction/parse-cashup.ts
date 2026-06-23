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

const CENTS_PER_RAND = 100;

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const MONEY = String.raw`(-?R[\d,]+\.\d{2})`;

const DATE_PATTERN = /From (\w{3}) (\d{1,2}), (\d{4})/;

function parseMoney(token: string): number {
  const negative = token.startsWith("-");
  const digits = token.replace(/[^\d.]/g, "");
  const cents = Math.round(Number.parseFloat(digits) * CENTS_PER_RAND);
  return negative ? -cents : cents;
}

function matchMoney(text: string, label: string, pattern: RegExp): number {
  const found = text.match(pattern);
  if (found === null) {
    throw new Error(`Cashup parse failed: could not find "${label}"`);
  }
  return parseMoney(found[1]);
}

function parseDate(text: string): string {
  const found = text.match(DATE_PATTERN);
  if (found === null) {
    throw new Error('Cashup parse failed: could not find "From <date>"');
  }
  const [, month, day, year] = found;
  const monthNumber = MONTHS[month];
  if (monthNumber === undefined) {
    throw new Error(`Cashup parse failed: unknown month "${month}"`);
  }
  return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
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
    date: parseDate(text),
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
