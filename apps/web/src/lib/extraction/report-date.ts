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

// "From <Mon> <d>, <yyyy> to <Mon> <d>, <yyyy>" — the report's period. A
// single-day report repeats the same date on both sides; a multi-day export
// has two different dates.
const PERIOD_PATTERN =
  /From (\w{3}) (\d{1,2}), (\d{4}) to (\w{3}) (\d{1,2}), (\d{4})/;
// Fallback for any report that carries only the "From" date, no period clause.
const DATE_PATTERN = /From (\w{3}) (\d{1,2}), (\d{4})/;

function toIsoDate(month: string, day: string, year: string): string {
  const monthNumber = MONTHS[month];
  if (monthNumber === undefined) {
    throw new Error(`Parse failed: unknown month "${month}"`);
  }
  return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
}

// Reads the report's period into a single YYYY-MM-DD Store Day date (Africa/
// Johannesburg, the report's own local date).
//
// Each Store Day is one Store on one calendar date, so only single-day reports
// can be ingested. A multi-day range export aggregates many days into one set
// of figures; ingesting it would silently write a whole period's totals onto
// its start date. Such reports are rejected here so the upload pipeline records
// them as failed rather than corrupting a Store Day.
export function parseReportDate(text: string): string {
  const period = text.match(PERIOD_PATTERN);
  if (period !== null) {
    const [, fromMonth, fromDay, fromYear, toMonth, toDay, toYear] = period;
    const from = toIsoDate(fromMonth, fromDay, fromYear);
    const to = toIsoDate(toMonth, toDay, toYear);
    if (from !== to) {
      throw new Error(
        `Multi-day range reports are not supported — upload a single-day export (this report covers ${from} to ${to})`
      );
    }
    return from;
  }

  const found = text.match(DATE_PATTERN);
  if (found === null) {
    throw new Error('Parse failed: could not find "From <date>"');
  }
  const [, month, day, year] = found;
  return toIsoDate(month, day, year);
}
