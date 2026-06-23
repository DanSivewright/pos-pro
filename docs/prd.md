# PRD — pos-pro Store Reporting MVP

Status: draft (Phase 1 output). Canonical brief: `docs/project-brief.md`. Language: `CONTEXT.md`.
Decisions: `docs/adr/`. Deferrals: `DEBT.md`.

## 1. Summary
A multi-tenant SaaS for South African stores. A store manager uploads their ServeUp POS
exports (PDF); we extract the figures in code into Convex; we serve visualized reports and
send a daily, exception-first email digest. Convex is the source of truth — reports and
emails are read only from Convex tables. Currency is ZAR.

## 2. Goals (in priority order)
1. Convex schema modelling exactly what reports + emails need (reason backwards from output).
2. Code-based extraction of PDF reports into Convex tables (no AI, no Python).
3. Visualized reports (Control Tower + Store drill-down).
4. Automatic daily exception-alert emails off stored data.
5. Full provenance: every figure traces to the Uploaded File it came from.

## 3. Users & auth
- **Store** = a Clerk Organization (tenant boundary). A store user sees only their Store.
- **Super-user** = Clerk `publicMetadata.superuser` flag; sees all Stores (ADR-0005).
- Auth is Clerk only. Every org on the platform is treated as active/paying (no billing).
- Authorization order in every Convex function: identity → super-user? all Stores : active-org
  Store → ownership check → execute.

## 4. Data model (five tables)
- **stores** — `clerkOrgId`, display name, sales target (cents), optional send-time override.
- **storeDays** — one per `(storeId, date)`; upsert-keyed. Fields owned per report-type:
  - Cashup: gross/net sales, discounts, voids, refunds, cash variance (all cents).
  - Royalty: channel mix (counter/call-in/app/Mr.Delivery/Uber/website), turnover, royalty due.
  - Gross Profit: GP%, FC%, stock-variance total.
  - Stock Wastage: waste cost.
  - Plus: `reportTypesReceived[]`, `needsReview` flag, provenance refs.
- **stockVarianceItems** — per `(storeDay, itemCode)`: name, category, actual COS, theoretical
  COS, variance, variance % (cents/2dp). Fully replaced on GP/Stock-Variance re-parse.
  Source: Gross Profit **or** Stock Variance (latest-wins; mismatch → needsReview).
- **uploads** — one per upload action: user, timestamp, storeId, file count.
- **uploadedFiles** — one per file: filename, detected report-type, detected date range,
  parse status (`parsed`/`failed`/`unsupported`), error reason, link to upload. Figures
  reference the uploadedFile. Raw bytes never stored (ADR-0003).

## 5. Ingestion & extraction
- Files parsed in a Next.js Node server boundary, in-memory, persisted via Convex mutations
  (ADR-0003). Tooling: `unpdf`; deterministic positional text parsing (machine-generated PDFs).
- **Five PDF parsers:** Cashup, Royalty, Gross Profit, Stock Variance, Stock Wastage.
- Store from active Clerk org (authoritative; warn on printed-name mismatch). Date + report-type
  parsed from file header.
- **Upsert/merge:** each report-type writes only its owned fields; re-upload overwrites that
  subset and re-points provenance; stockVarianceItems fully replaced.
- **Per-file transactional ingest:** a file fully parses or is marked `failed`; no partial writes.
- **Verification (light):** check figures against in-report control totals; cross-report shared
  figures (GP net sales vs Royalty net sales) must agree or the day is `needsReview`. No AI fallback.

## 6. Reports (screens) — desktop-first, fully responsive (ADR-0002)
1. **Upload** — multi-file drag/drop; per-file status; shows touched Store Day(s) + completeness.
2. **Control Tower** (landing) — super-user: all Stores traffic-lit, worst-first (MTD net, vs
   target, GP%, status). Store user: their Store only.
3. **Store drill-down** — daily net-sales-vs-target chart, channel mix, GP%/FC%, top stock-variance
   items, recent Store Days + completeness.
- Charts: shadcn charts (Recharts). UI phase gets a huashu-design pass.

## 7. Exception alerts (email)
- Daily Convex cron (default 06:00 SAST, env-configurable) reads latest Store Day per Store,
  computes exceptions, renders severity-tiered HTML digest, sends via Resend (ADR-0004).
- Recipients live from Clerk: store members get their Store's section; super-users get the
  consolidated cross-Store digest. Clean stores hidden; worst-first.
- **Thresholds (global constants):** sales −10% Watch / −20% Critical vs target; GP% <55% Watch /
  <50% Critical; cash variance ≥R30 Watch / ≥R100 Critical; stock variance −R100 Watch / −R300
  Critical. Royalty due = 8% of net sales (informational).

## 8. Out of scope (see DEBT.md)
Raw PDF storage; payments/billing; AI extraction; override/invoice-gap metrics; petty-cash/
deliveries/hourly detail; CSV/XLSX ingestion; per-store threshold overrides; in-app super-user
toggle; event-driven real-time alerts; non-ServeUp POS vendors.

## 9. Success criteria
- Real reference files (rp-first-batch, rp-sv-forms) parse into correct Store Days with figures
  matching the PDFs to the cent, traceable to their Uploaded File.
- Control Tower + drill-down render those Store Days; super-user sees all, store user sees one.
- The daily digest reproduces the prototype's exception-first, severity-tiered intent from
  Convex data alone.
- `pnpm dlx ultracite fix` clean; `pnpm run check-types` clean; no console.log / TODO.
