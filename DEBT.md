# Technical Debt & Deliberate Deferrals

Known shortcuts and out-of-scope items, with the cost and the correct fix. Each was a
deliberate MVP scoping decision (see grill session / ADRs), not an accident.

| Item | Why deferred | Cost / risk | Correct fix |
|---|---|---|---|
| **Manager-override & invoice-gap metrics/alerts** | No source file carries them (no over-ring report, no invoice-sequence export). The prototype's claims were narrative, not data. | The two loudest prototype alerts are absent. | Obtain ServeUp over-ring / invoice-sequence exports, add parsers + Store Day fields + thresholds. |
| **Petty Cash detail table + parser** | Not needed by core reports/alerts; was a "verify this" yellow flag only. | No petty-cash drill-down or odd-expense flagging. | Add `pettyCashEntries` table + parser; flag anomalous descriptions. |
| **Per-driver Deliveries table + parser** | Driver-concentration was a low-severity flag, not core. | No driver-concentration risk surfacing. | Add `deliveries` table + parser; compute per-driver share. |
| **Hourly Sales detail table + parser** | Intraday detail not required for MVP reports/alerts. | No intraday sales chart. | Add `hourlySales` table + parser. |
| **CSV ingestion** | No sample CSV provided; parsing blind = guessing format. | Brief lists CSV; only PDF path built. | Obtain a sample CSV per report-type, add format-specific parsers. |
| **XLSX ingestion** | Gross Profit PDF already supplies per-item variance; Stock Variance parsed from PDF. | Spreadsheet-only stores unsupported. | Add SheetJS-based parsers when a store sends XLSX-only data. |
| **Per-store threshold overrides** | Global default constants suffice for MVP; brief warns against premature configurability. | All stores share thresholds. | Add optional per-store override fields on `stores`, fall back to defaults. |
| **In-app super-user toggle** | Clerk dashboard/API toggle is sufficient for MVP (ADR-0005). | Owner edits super-user flag in Clerk, not in-app. | Build an admin screen calling the Clerk API. |
| **Event-on-ingest real-time alerts** | Daily cron chosen (ADR-0004) to avoid dedup complexity. | Alerts are daily, not immediate. | Add event-driven evaluation with per-Store-Day dedup. |
| **Cashup drill-down Playwright spec not yet executed** | Slice #3 ships the spec + config (`apps/web/e2e/store-drill-down.spec.ts`, desktop + mobile projects) but running it green needs a Clerk **test user belonging to one Organization**, `E2E_CLERK_USER_EMAIL`/`_PASSWORD` env, `pnpm -F web exec playwright install chromium`, and live `next dev` + `convex dev`. These are credentials/stack only the operator can provide. | The drill-down acceptance criterion is verified by code review + unit/convex-test, but not yet by a real browser run. | Provision a `+clerk_test` user in one Org, set the env vars, install browsers, and run `pnpm -F web test:e2e`. Wire into CI once a seeded test deployment exists. |
| **Scaffold ultracite debt (35 errors)** | Better-T-Stack/shadcn scaffold ships files that violate ultracite (nested ternaries + unused/namespace imports in `apps/web` demo files; `packages/ui` shadcn components; CSS `noDescendingSpecificity` in `globals.css`). These are template/demo/vendored files slated for replacement. Renaming any Convex files would also change their `api.*` refs (high blast radius). | Repo-wide `ultracite check` is red, but every file authored by the build (all slice + audit files) is clean. | Address in a dedicated cleanup: auto-fix `apps/web` demo files (or delete when superseded); rename Convex demo files to kebab-case and update refs; reconcile `packages/ui` shadcn components with ultracite (or scope them out of lint). |

## Non-negotiable deviations (recorded, not debt)
- buildmore stack → Convex/Clerk/Vercel (ADR-0001).
- buildmore mobile-first → desktop-first responsive (ADR-0002).
- buildmore CUID2/soft-delete → Convex IDs + selective soft-delete (ADR-0006).
