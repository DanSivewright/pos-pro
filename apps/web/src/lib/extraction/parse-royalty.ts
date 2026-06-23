import { MONEY, matchMoney } from "./money";
import { parseReportDate } from "./report-date";

/**
 * Parses the text of a ServeUp "Royalty" report into the Royalty-owned Store
 * Day figures: the net-turnover channel mix, the turnover/tax totals and the
 * royalty due. All money is integer cents; the date is YYYY-MM-DD.
 *
 * `netSales` is read from the report only to verify the royalty due (8% of net
 * sales) — it is a Cashup-owned figure and is not persisted by the Royalty
 * ingest. Input is the flat text produced by unpdf.
 */
export interface ChannelMix {
  callIn: number;
  counter: number;
  mobileApp: number;
  mrDelivery: number;
  uberEats: number;
  website: number;
}

export interface RoyaltyExtract {
  channelMix: ChannelMix;
  date: string;
  deliveryFees: number;
  netSales: number;
  netTurnover: number;
  royaltyDue: number;
  tax: number;
}

export function parseRoyalty(text: string): RoyaltyExtract {
  return {
    date: parseReportDate(text),
    channelMix: {
      callIn: matchMoney(text, "Call in", new RegExp(`Call in\\s+${MONEY}`)),
      counter: matchMoney(text, "Counter", new RegExp(`Counter\\s+${MONEY}`)),
      mobileApp: matchMoney(
        text,
        "Mobile app",
        new RegExp(`Mobile app\\s+${MONEY}`)
      ),
      mrDelivery: matchMoney(
        text,
        "Mr. Delivery",
        new RegExp(`Mr\\. Delivery\\s+${MONEY}`)
      ),
      uberEats: matchMoney(
        text,
        "Uber eats",
        new RegExp(`Uber eats\\s+${MONEY}`)
      ),
      website: matchMoney(text, "Website", new RegExp(`Website\\s+${MONEY}`)),
    },
    netSales: matchMoney(
      text,
      "Net Sales",
      new RegExp(`Net Sales\\s+${MONEY}`)
    ),
    deliveryFees: matchMoney(
      text,
      "Delivery Fees",
      new RegExp(`Delivery Fees\\s+${MONEY}`)
    ),
    netTurnover: matchMoney(
      text,
      "Total Net Turnover",
      new RegExp(`Total Net Turnover\\s+${MONEY}`)
    ),
    tax: matchMoney(
      text,
      "Tax",
      new RegExp(`(?<!Excl )(?<!Incl )Tax\\s+${MONEY}`)
    ),
    royaltyDue: matchMoney(
      text,
      "Royalty Total Incl Tax",
      new RegExp(`Royalty Total Incl Tax\\s+${MONEY}`)
    ),
  };
}
