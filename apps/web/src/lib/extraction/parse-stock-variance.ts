import { matchMoney, parseMoney } from "./money";
import { parseReportDate } from "./report-date";

/**
 * Parses the text of a ServeUp "Stock Variance" report. It is an alternative
 * provider of the per-item stock-variance set (the other being Gross Profit),
 * plus the grand variance total it contributes to the Store Day.
 *
 * Unlike Gross Profit, this report gives per-item usage as quantities, not
 * cost-of-sales money — so each row contributes only the money `variance`
 * (its "Variance Value" column) and the `variancePercent`. Money is integer
 * cents; the date is YYYY-MM-DD. Input is the flat text from unpdf.
 *
 * Each item row is anchored by its unit-of-measure, eight numeric columns
 * (Opening, Purchases, Net Stock Movement, Closing, Actual Usage, Theoretical
 * Usage, Variance, Variance Percentage) and three money columns (Variance
 * Value, Closing Unit Cost, Closing Stock Value); the free text before them is
 * the code and name, letting wrapped multi-line names rejoin deterministically.
 */
export interface StockVarianceRowExtract {
  category: string;
  code: string;
  name: string;
  variance: number;
  variancePercent: number;
}

export interface StockVarianceExtract {
  date: string;
  items: StockVarianceRowExtract[];
  stockVarianceTotal: number;
}

const COLUMN_HEADER =
  "Code Name UoM Opening Stock Purchases Net Stock Movement Closing Stock Actual Usage Theoretical Usage Variance Variance Percentage Variance Value Closing Unit Cost Closing Stock Value";

const MONEY_TOKEN = String.raw`-?R[\d,]+\.\d{2}`;
const UOM = "(?:EACH|KG|L|G)";
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;

// One stock-variance row: code + name, the unit of measure, the eight numeric
// columns, then the three money columns. The leading group is lazy so, scanned
// globally, each match starts immediately after the previous row and captures
// just its code + name.
const NUMERIC_COLUMNS = 8;
const ROW = new RegExp(
  `(.+?)\\s+${UOM}\\s+${Array.from(
    { length: NUMERIC_COLUMNS },
    () => `(${NUMBER})`
  ).join("\\s+")}\\s+(${MONEY_TOKEN})\\s+${MONEY_TOKEN}\\s+${MONEY_TOKEN}`,
  "g"
);

// The grand variance total: the Summary's final "Total" row, two money columns
// (Total Variance, Total Closing Stock). "Totals" (per-category) and the
// "Total Variance"/"Total Closing Stock" header words do not match — neither is
// a bare "Total" followed by two money tokens.
const GRAND_TOTAL = new RegExp(`Total\\s+(${MONEY_TOKEN})\\s+${MONEY_TOKEN}`);

const STRONG_CODE = /[\d-]/;
const WHITESPACE = /\s+/;
const WHITESPACE_GLOBAL = /\s+/g;
const MONEY_GLOBAL = new RegExp(MONEY_TOKEN, "g");
const ROW_VARIANCE_PERCENT = 9;
const ROW_VARIANCE_VALUE = 10;
const LEADING_DROP_MIN = 2;

// Splits a row's leading text into code and name. Leading stray tokens — a name
// fragment wrapped onto the next page, or a category label that landed at a
// page top — are dropped when the following token is clearly the item code. A
// code split across two lines leaves a trailing hyphen on its first part, which
// rejoins with the next token.
function splitCodeName(raw: string): { code: string; name: string } {
  const tokens = raw.split(WHITESPACE);
  while (
    tokens.length >= LEADING_DROP_MIN &&
    !STRONG_CODE.test(tokens[0]) &&
    STRONG_CODE.test(tokens[1])
  ) {
    tokens.shift();
  }
  let code = tokens.shift() ?? "";
  if (code.endsWith("-") && tokens.length > 0) {
    code += tokens.shift();
  }
  return { code, name: tokens.join(" ") };
}

// Reduces a between-categories fragment to its category label. The label is the
// letter-spaced run that trails the per-category "Totals" line; it is isolated
// by dropping everything up to the last money token (the Totals figures), then
// any page footer and report preamble, then closing the letter-spaced gaps the
// PDF renders headers with ("C h e e s e" -> "Cheese"). Returns "" when no
// label remains.
function trailingCategory(fragment: string): string {
  let rest = fragment;
  let lastMoneyEnd = -1;
  MONEY_GLOBAL.lastIndex = 0;
  for (
    let m = MONEY_GLOBAL.exec(rest);
    m !== null;
    m = MONEY_GLOBAL.exec(rest)
  ) {
    lastMoneyEnd = m.index + m[0].length;
  }
  if (lastMoneyEnd !== -1) {
    rest = rest.slice(lastMoneyEnd);
  }
  const moeng = rest.lastIndexOf("Moeng");
  if (moeng !== -1) {
    rest = rest.slice(moeng + "Moeng".length);
  }
  const vat = rest.lastIndexOf("VAT");
  if (vat !== -1) {
    rest = rest.slice(vat + "VAT".length);
  }
  return rest.replace(WHITESPACE_GLOBAL, "");
}

function parseSegment(
  segment: string,
  incoming: string
): { items: StockVarianceRowExtract[]; nextCategory: string } {
  ROW.lastIndex = 0;
  const items: StockVarianceRowExtract[] = [];
  const category = incoming;
  let consumedTo = 0;
  let match = ROW.exec(segment);
  while (match !== null) {
    consumedTo = ROW.lastIndex;
    const { code, name } = splitCodeName(match[1].trim());
    items.push({
      code,
      name,
      category,
      variancePercent: Number.parseFloat(match[ROW_VARIANCE_PERCENT]),
      variance: parseMoney(match[ROW_VARIANCE_VALUE]),
    });
    match = ROW.exec(segment);
  }
  const trailing = trailingCategory(segment.slice(consumedTo));
  return { items, nextCategory: trailing === "" ? category : trailing };
}

export function parseStockVariance(text: string): StockVarianceExtract {
  const segments = text.split(COLUMN_HEADER);
  const items: StockVarianceRowExtract[] = [];
  let category = trailingCategory(segments[0]);
  for (let i = 1; i < segments.length; i += 1) {
    const { items: rows, nextCategory } = parseSegment(segments[i], category);
    items.push(...rows);
    category = nextCategory;
  }

  return {
    date: parseReportDate(text),
    stockVarianceTotal: matchMoney(text, "Total", GRAND_TOTAL),
    items,
  };
}
