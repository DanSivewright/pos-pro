# Exception-alert emails are daily-cron-driven off Convex, sent via Resend

Exception alerts are produced by a **daily Convex cron job** that reads the latest Store
Day per Store from Convex, computes exceptions, renders the severity-tiered HTML digest,
and sends it via **Resend** (from the Convex action the cron triggers). This honours the
brief's "everything we email about is read from Convex tables" — the email path depends on
stored data, not on the upload path — and avoids the dedup complexity of event-on-ingest
alerts. Default send time **06:00 SAST (Africa/Johannesburg)**, configurable via env.
Recipients are read live from Clerk: a Store's org members get their Store's section;
super-users get the consolidated cross-Store digest.

Status: accepted

## Considered options
- Event-on-ingest alerts — rejected for MVP: requires dedup across partial/re-uploads.
- Daily cron reading Convex — chosen: deterministic, simple, matches the prototype's digest.

## Consequences
- Resend is the one new external dependency (RESEND_API_KEY in env).
