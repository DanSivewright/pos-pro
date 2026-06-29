# Technical Debt & Deliberate Deferrals

Known shortcuts and out-of-scope items, with the cost and the correct fix. Each was a
deliberate MVP scoping decision (see grill session / ADRs), not an accident.

| Item | Why deferred | Cost / risk | Correct fix |
|---|---|---|---|
| **Manager-override & invoice-gap metrics/alerts** | No source file carries them (no over-ring report, no invoice-sequence export). The prototype's claims were narrative, not data. | The two loudest prototype alerts are absent. | Obtain ServeUp over-ring / invoice-sequence exports, add parsers + Store Day fields + thresholds. → #24 |
| **Petty Cash detail table + parser** | Not needed by core reports/alerts; was a "verify this" yellow flag only. | No petty-cash drill-down or odd-expense flagging. | Add `pettyCashEntries` table + parser; flag anomalous descriptions. → #24 |
| **Per-driver Deliveries table + parser** | Driver-concentration was a low-severity flag, not core. | No driver-concentration risk surfacing. | Add `deliveries` table + parser; compute per-driver share. → #24 |
| **Hourly Sales detail table + parser** | Intraday detail not required for MVP reports/alerts. | No intraday sales chart. | Add `hourlySales` table + parser. → #24 |
| **CSV ingestion** | No sample CSV provided; parsing blind = guessing format. | Brief lists CSV; only PDF path built. | Obtain a sample CSV per report-type, add format-specific parsers. → #24 |
| **XLSX ingestion** | Gross Profit PDF already supplies per-item variance; Stock Variance parsed from PDF. | Spreadsheet-only stores unsupported. | Add SheetJS-based parsers when a store sends XLSX-only data. → #24 |
| **Per-store threshold overrides** | Global default constants suffice for MVP; brief warns against premature configurability. | All stores share thresholds. | Add optional per-store override fields on `stores`, fall back to defaults. → #22 |
| **In-app super-user toggle** | Clerk dashboard/API toggle is sufficient for MVP (ADR-0005). | Owner edits super-user flag in Clerk, not in-app. | Build an admin screen calling the Clerk API. → #23 |
| **Event-on-ingest real-time alerts** | Daily cron chosen (ADR-0004) to avoid dedup complexity. | Alerts are daily, not immediate. | Add event-driven evaluation with per-Store-Day dedup. |
| **Cashup drill-down Playwright spec not yet executed** | Slice #3 ships the spec + config (`apps/web/e2e/store-drill-down.spec.ts`, desktop + mobile projects) but running it green needs a Clerk **test user belonging to one Organization**, `E2E_CLERK_USER_EMAIL`/`_PASSWORD` env, `pnpm -F web exec playwright install chromium`, and live `next dev` + `convex dev`. These are credentials/stack only the operator can provide. | The drill-down acceptance criterion is verified by code review + unit/convex-test, but not yet by a real browser run. | Provision a `+clerk_test` user in one Org, set the env vars, install browsers, and run `pnpm -F web test:e2e`. Wire into CI once a seeded test deployment exists. → #11 |
| ~~**No cursor pagination on Upload History**~~ | ~~`uploads.listForStore` caps the audit trail to the 50 most-recent batches via `.take(50)`.~~ | **RESOLVED (#13, commit `35bb359`):** `listForStore` now uses `.paginate()` (50 batches/page); `UploadHistory` panel uses `usePaginatedQuery` + "Load more". Auth-denied callers get an empty exhausted page. | — done — |
| **Upload History shows raw Clerk subject, not a human name** | `uploads.uploadedBy` is the raw Clerk subject id. Resolving it to a name needs a Clerk API fetch, which is an action — a `query` cannot make it, and the live history is a reactive `useQuery`. | The "uploaded by" column reads e.g. `user_3FY…` rather than a person. | Resolve subjects → display names via a Clerk fetch in an action (batch + cache by subject), or denormalise the uploader's name onto the `uploads` row at ingest time. → #21 |
| **Scaffold ultracite debt (35 errors)** | Better-T-Stack/shadcn scaffold ships files that violate ultracite (nested ternaries + unused/namespace imports in `apps/web` demo files; `packages/ui` shadcn components; CSS `noDescendingSpecificity` in `globals.css`). These are template/demo/vendored files slated for replacement. Renaming any Convex files would also change their `api.*` refs (high blast radius). | Repo-wide `ultracite check` is red, but every file authored by the build (all slice + audit files) is clean. | Address in a dedicated cleanup: auto-fix `apps/web` demo files (or delete when superseded); rename Convex demo files to kebab-case and update refs; reconcile `packages/ui` shadcn components with ultracite (or scope them out of lint). → #18, #19 |

## Scalability ceilings (verified from code, 2026-06-29)

Per-tenant access is indexed and isolated, so the **store-user** path scales to
low-thousands of concurrent viewers and years of history without change. The
limits below are the walls for the **super-user / multi-store** scale. Ordered
by what breaks first. Comfortable today: ~150–200 stores; correct all four and
the same foundation reaches thousands.

| Item | Why deferred | Cost / risk | Correct fix |
|---|---|---|---|
| **`.take(200)` hard store cap (silent truncation)** | `MAX_STORES = 200` in `lib/authz.ts` bounds `getPermittedStores`; `digestData.dataForDigest` reads `take(200)` too. A simple bounded read was right for the MVP cohort. | **Past 200 total stores, the super-user Control Tower (`stores.ts:97`) shows an arbitrary 200-store subset and the daily digest silently skips the rest — no error.** This is the first thing to break, and it fails silently (worse than throwing). | Paginate both reads (cursor or batched `take`); the Control Tower can't just raise the constant because of the fan-out below — it needs the rollup. → #17 |
| ~~**Super-user Control Tower fan-out (no monthly rollup)**~~ | ~~`controlTower` `Promise.all`s `buildTile` over every permitted store, each doing a month-range `.collect()`.~~ | **RESOLVED (#16, commit `3f799cd`):** new denormalised `storeMonths` table (mtdNet + latestGpPercent), maintained by `recomputeStoreMonth` inside the Cashup/Gross Profit ingest mutations; `controlTower` now reads one indexed `storeMonths` point-row per store instead of scanning the month's Store Days. `storeMonths.backfill` (scheduler fan-out) rebuilds it; verified on dev. | — done — |
| **Upload route: ~~sequential per-file processing~~, no rate limit, large-PDF risk** | `route.ts` did files in a `for...of await` loop. **PARALLELISED (#14, commit `18dd63a`):** now `mapWithConcurrency(files, 5, …)` (`apps/web/src/lib/concurrency.ts`) — bounded worker pool, results pinned to input order, per-file ingest mutations are independent OCC-safe Convex txns. Remaining: no rate limiting + no large-PDF cap/stream. | A single very large PDF can still **OOM / timeout** the function; no per-org rate limiting on the endpoint. | Cap/stream large PDFs; add per-org rate limiting. → #20 |
| ~~**Digest send: serial loop of external calls**~~ | ~~`digest.send` iterates stores making sequential Clerk + Resend calls in one action.~~ | **RESOLVED (#15, commit `329f362`):** `digest.send` now fans each Store's send out via `ctx.scheduler.runAfter(0, internal.digest.sendOne, …)` — one short action per Store, no serial wall, no shared Resend rate-limit pressure. Super-user consolidated send stays inline; env-missing no-op + per-send failure logging preserved. | — done — |
| ~~**Unbounded `storeDays.listForStore` collect (drill-down)**~~ | ~~`.collect()`s every Store Day for a store with no bound.~~ | **RESOLVED (#12, commit `e3285db`):** `listForStore` now uses `.paginate()` (30 days/page); drill-down uses `usePaginatedQuery` + "Load more". Auth-denied callers get an empty exhausted page. | — done — |

## Non-negotiable deviations (recorded, not debt)
- buildmore stack → Convex/Clerk/Vercel (ADR-0001).
- buildmore mobile-first → desktop-first responsive (ADR-0002).
- buildmore CUID2/soft-delete → Convex IDs + selective soft-delete (ADR-0006).
