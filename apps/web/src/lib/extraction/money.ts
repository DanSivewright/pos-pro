const CENTS_PER_RAND = 100;

// Matches a Rand money token in the extracted text, e.g. "R12,571.00" or
// "-R145.50". Used as a capture group inside report-specific label patterns.
export const MONEY = String.raw`(-?R[\d,]+\.\d{2})`;

// Converts a Rand money token to integer cents. "R12,571.00" -> 1257100.
export function parseMoney(token: string): number {
  const negative = token.startsWith("-");
  const digits = token.replace(/[^\d.]/g, "");
  const cents = Math.round(Number.parseFloat(digits) * CENTS_PER_RAND);
  return negative ? -cents : cents;
}

// Finds the first money token matched by pattern, throwing a labelled error
// when the figure is absent so the caller can mark the file failed.
export function matchMoney(
  text: string,
  label: string,
  pattern: RegExp
): number {
  const found = text.match(pattern);
  if (found === null) {
    throw new Error(`Parse failed: could not find "${label}"`);
  }
  return parseMoney(found[1]);
}
