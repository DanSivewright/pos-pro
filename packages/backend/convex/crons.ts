import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Send time is env-configurable; defaults to 04:00 UTC = 06:00 SAST.
const hourUTC = Number.parseInt(process.env.DIGEST_HOUR_UTC ?? "4", 10);
const minuteUTC = Number.parseInt(process.env.DIGEST_MINUTE_UTC ?? "0", 10);

const crons = cronJobs();

crons.daily(
  "daily-exception-digest",
  { hourUTC, minuteUTC },
  internal.digest.send,
  {}
);

export default crons;
