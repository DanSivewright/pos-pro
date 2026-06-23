# Ticket Breakdown — pos-pro MVP

Vertical, independently-shippable slices with blocking relationships. Ordered by the
buildmore build flow (DB → contracts → build/TDD → UI → verify → pre-ship → longevity).
Not yet pushed to a tracker — run `to-issues` / `to-prd` to publish when ready.

Legend: `⛔ blocks` / `needs` denote dependencies.

## Phase 2 — Database (Convex schema)
- **T1 — Convex schema: five tables.** Define `stores`, `storeDays`, `stockVarianceItems`,
  `uploads`, `uploadedFiles` with indexes (`storeDays` by `[storeId, date]`; `uploadedFiles`
  by `uploadId`; `stockVarianceItems` by `storeDayId`). Money as cents, date as `YYYY-MM-DD`.
  *needs: nothing.* ⛔ blocks T3, T4, T6.
- **T2 — Auth wiring + super-user claim.** Clerk JWT template exposes `publicMetadata.superuser`;
  Convex `ctx.auth` helper resolving caller → permitted store(s). Seed deterministic dev data.
  *needs: T1.* ⛔ blocks T6, T7, T8.

## Phase 3 — Contracts
- **T3 — Parser contracts.** `types`/validators for each parser's normalized output (a partial
  Store Day + item set), the report-type detector signature, and the ingest result shape
  (per-file status). *needs: T1.* ⛔ blocks T4, T5.

## Phase 4 — Build (TDD, one parser slice at a time)
- **T4 — Ingest pipeline + provenance.** Next.js Node route: accept multipart, detect report-type,
  dispatch to parser, persist via Convex mutations (upsert Store Day, replace items), write
  uploads/uploadedFiles, per-file transactional status. *needs: T1, T3.* ⛔ blocks T5, T9.
- **T5a — Cashup parser** (net/gross sales, discounts, voids, refunds, cash variance). + control-total check.
- **T5b — Royalty parser** (channel mix, turnover, royalty due).
- **T5c — Gross Profit parser** (GP%, FC%, stock-variance total + per-item items; multi-line name rejoin).
- **T5d — Stock Variance parser** (per-item items; latest-wins vs GP, mismatch → needsReview).
- **T5e — Stock Wastage parser** (waste cost).
  *each needs: T4. Each is a TDD slice with a fixture from `docs/reference/`.* ⛔ T5c/T5d block T8 drill-down items.
- **T6 — Store config + queries.** Set per-store sales target; queries for Control Tower (all/one
  store, MTD rollups) and drill-down (Store Days, items), all store-scoped by T2. *needs: T1, T2.*
  ⛔ blocks T7, T8.

## Phase 4 — UI (huashu-design pass)
- **T7 — Control Tower screen.** Traffic-lit tiles, worst-first; super-user all / store user one.
  *needs: T6.* ⛔ blocks T10.
- **T8 — Store drill-down screen.** Sales-vs-target chart, channel mix, GP%/FC%, top variances,
  recent Store Days + completeness. *needs: T6 (+ T5c/T5d for items).* ⛔ blocks T10.
- **T9 — Upload screen.** Drag/drop, per-file status, touched-day completeness. *needs: T4.*

## Phase 4 — Email
- **T10 — Daily exception digest.** Convex cron (06:00 SAST, env) → action: compute exceptions
  from Store Days, render severity-tiered HTML, send via Resend; recipients from Clerk.
  *needs: T6.*

## Phase 5–7 — Verify / Pre-ship / Longevity
- **T11 — Browser verification.** Desktop + responsive mobile scenarios; auth/IDOR test
  (store user cannot see another Store); no console errors. *needs: T7, T8, T9.*
- **T12 — Adversarial reviews.** Non-negotiables checklist, security review (Zod→auth→ownership),
  senior review. *needs: T11.*
- **T13 — Pre-ship + deploy to Vercel.** `.env.example`, Convex prod deploy, Resend keys,
  Clerk prod, Lighthouse baseline. Log issues in ERROR_LOG.md. *needs: T12.*
