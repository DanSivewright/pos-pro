import { MONEY, matchMoney, parseMoney } from "./money";
import { parseReportDate } from "./report-date";

/**
 * Parses the text of a ServeUp "Gross Profit" report. It contributes the
 * summary GP%/FC% and the stock-variance total to the Store Day, plus the full
 * per-item stock-variance set (one row per stock item, grouped by category).
 *
 * `netSales` is read from the summary only to reconcile against the Royalty
 * report — it stays a Cashup-owned figure and is not persisted here. Money is
 * integer cents; the date is YYYY-MM-DD. Input is the flat text from unpdf.
 *
 * Each item row is anchored by its seven money columns (Opening, Purchases,
 * Net Stock Movement, Closing, Actual COS, Theoretical COS, Variance) followed
 * by the variance percentage; the free text before them is the code and name,
 * which lets wrapped multi-line names rejoin deterministically.
 */
export interface StockVarianceItemExtract {
  actualCos: number;
  category: string;
  code: string;
  name: string;
  theoreticalCos: number;
  variance: number;
  variancePercent: number;
}

export interface GrossProfitExtract {
  date: string;
  fcPercent: number;
  gpPercent: number;
  items: StockVarianceItemExtract[];
  netSales: number;
  stockVarianceTotal: number;
}

const COLUMN_HEADER =
  "Code Name Opening Purchases Net Stock Movement Closing Actual COS Theoretical COS Variance Variance Percentage";

const MONEY_TOKEN = String.raw`-?R[\d,]+\.\d{2}`;
const PERCENT_TOKEN = String.raw`(?:-?[\d,]+\.\d{2}%|N/A|NaN%|-?Infinity%)`;

// One stock-variance row: code + name, the seven money columns, then the
// variance percentage. The leading group is lazy so, scanned globally, each
// match starts immediately after the previous row and captures just its
// code+name.
const ROW = new RegExp(
  `(.+?)\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s+(${PERCENT_TOKEN})`,
  "g"
);

// The summary band: six money columns after the header, the fifth being the
// grand stock variance total.
const SUMMARY_VARIANCE = new RegExp(
  `Summary\\s+Opening\\s+Purchases\\s+Net Stock Movement\\s+Theoretical COS\\s+Variance\\s+Closing\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}`
);

const NUMERIC_PERCENT = /^-?[\d,]+\.\d{2}%$/;
const STRONG_CODE = /[\d-]/;
const UPPER_LABEL = /^[A-Z]{3,}$/;
const WHITESPACE = /\s+/;
const SUMMARY_VARIANCE_GROUP = 5;
const PERCENT_COLUMNS = 2;

// "N/A", "NaN%" and "Infinity%" mean the percentage was undefined (a zero
// theoretical cost); only a real figure carries through, otherwise zero.
function parsePercent(token: string): number {
  if (!NUMERIC_PERCENT.test(token)) {
    return 0;
  }
  return Number.parseFloat(token.replace(/[,%]/g, ""));
}

// Reads the Actual column of a summary percentage row ("GP% 56.66% 57.21% ...")
// — the figure the store actually achieved, not the theoretical target.
function matchActualPercent(text: string, label: string): number {
  const found = text.match(new RegExp(`${label}\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (found === null) {
    throw new Error(`Parse failed: could not find "${label}"`);
  }
  return Number.parseFloat(found[PERCENT_COLUMNS]);
}

// Reduces a between-categories fragment to its category label by dropping the
// page footer and report title that may precede it, then closing the
// letter-spaced gaps the PDF renders headers with ("C H E E S E" -> "CHEESE").
// Returns "" when the fragment is only a footer.
function trailingCategory(fragment: string): string {
  let rest = fragment;
  const moeng = rest.lastIndexOf("Moeng");
  if (moeng !== -1) {
    rest = rest.slice(moeng + "Moeng".length);
  }
  const year = rest.lastIndexOf("2026");
  if (year !== -1) {
    rest = rest.slice(year + "2026".length);
  }
  return rest.replace(/\s+/g, "");
}

// Splits a row's leading text into code and name. Leading stray tokens — a name
// fragment wrapped onto the next page, or a category label that landed at a page
// top — are dropped when the following token is clearly the item code; an
// all-caps drop is itself a category. A code split across two lines leaves a
// trailing hyphen on its first part, which rejoins with the next token.
function splitCodeName(raw: string): {
  category: string | null;
  code: string;
  name: string;
} {
  const tokens = raw.split(WHITESPACE);
  let category: string | null = null;
  while (
    tokens.length >= PERCENT_COLUMNS &&
    !STRONG_CODE.test(tokens[0]) &&
    STRONG_CODE.test(tokens[1])
  ) {
    const dropped = tokens.shift();
    if (dropped !== undefined && UPPER_LABEL.test(dropped)) {
      category = dropped;
    }
  }
  let code = tokens.shift() ?? "";
  if (code.endsWith("-") && tokens.length > 0) {
    code += tokens.shift();
  }
  return { code, name: tokens.join(" "), category };
}

const ROW_ACTUAL_COS = 6;
const ROW_THEORETICAL_COS = 7;
const ROW_VARIANCE = 8;
const ROW_PERCENT = 9;

function parseSegment(
  segment: string,
  incoming: string
): { items: StockVarianceItemExtract[]; nextCategory: string } {
  ROW.lastIndex = 0;
  const items: StockVarianceItemExtract[] = [];
  let category = incoming;
  let consumedTo = 0;
  let match = ROW.exec(segment);
  while (match !== null) {
    consumedTo = ROW.lastIndex;
    // A category Total row ("Total ...") — sometimes preceded by a page footer
    // when the break lands right before it — carries no item and is skipped.
    const codeName = match[1].trim();
    if (codeName !== "Total" && !codeName.endsWith(" Total")) {
      const { code, name, category: inlineCategory } = splitCodeName(codeName);
      if (inlineCategory !== null) {
        category = inlineCategory;
      }
      items.push({
        code,
        name,
        category,
        actualCos: parseMoney(match[ROW_ACTUAL_COS]),
        theoreticalCos: parseMoney(match[ROW_THEORETICAL_COS]),
        variance: parseMoney(match[ROW_VARIANCE]),
        variancePercent: parsePercent(match[ROW_PERCENT]),
      });
    }
    match = ROW.exec(segment);
  }
  const trailing = trailingCategory(segment.slice(consumedTo));
  return { items, nextCategory: trailing === "" ? category : trailing };
}

export function parseGrossProfit(text: string): GrossProfitExtract {
  const summary = text.match(SUMMARY_VARIANCE);
  if (summary === null) {
    throw new Error('Parse failed: could not find "Summary"');
  }

  const segments = text.split(COLUMN_HEADER);
  const items: StockVarianceItemExtract[] = [];
  let category = trailingCategory(segments[0]);
  for (let i = 1; i < segments.length; i += 1) {
    const { items: rows, nextCategory } = parseSegment(segments[i], category);
    items.push(...rows);
    category = nextCategory;
  }

  return {
    date: parseReportDate(text),
    gpPercent: matchActualPercent(text, "GP%"),
    fcPercent: matchActualPercent(text, "FC%"),
    netSales: matchMoney(
      text,
      "Net Sales",
      new RegExp(`Net Sales\\s+${MONEY}`)
    ),
    stockVarianceTotal: parseMoney(summary[SUMMARY_VARIANCE_GROUP]),
    items,
  };
}
