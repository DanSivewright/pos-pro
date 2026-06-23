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

const DATE_PATTERN = /From (\w{3}) (\d{1,2}), (\d{4})/;

// Reads the report's "From <Mon> <d>, <yyyy>" header into a YYYY-MM-DD string
// (Africa/Johannesburg, the report's own local date). Single-day reports only.
export function parseReportDate(text: string): string {
  const found = text.match(DATE_PATTERN);
  if (found === null) {
    throw new Error('Parse failed: could not find "From <date>"');
  }
  const [, month, day, year] = found;
  const monthNumber = MONTHS[month];
  if (monthNumber === undefined) {
    throw new Error(`Parse failed: unknown month "${month}"`);
  }
  return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
}
