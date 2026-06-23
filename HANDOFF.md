# Handoff — pos-pro (Store Reporting SaaS)

**Date:** 2026-06-23
**Branch:** `master` @ `784cb0c` (pushed to origin/DanSivewright/pos-pro)
**For:** Dan — review tomorrow

---

## TL;DR

The full build skeleton is done. **10 of 11 tracer-bullet slices are shipped and committed**
(issues #2–#10 closed). The app runs locally end-to-end: PDF upload → code-based extraction →
Convex → Control Tower + Store drill-down, plus a daily exception-alert digest cron. The
Twenty-derived design pass is applied across all three MVP screens. **Only issue #11 remains open.**

Today specifically: started the dev server, fixed a Next.js 16 startup crash, and verified the
stack is live. One thing is blocked — see "Blocked / Needs You" below.

---

## What's built (slices #2–#10, all committed)

| # | Slice | Commit |
|---|-------|--------|
| 2 | Walking skeleton — schema, store-scoped auth boundary | `afbd608` |
| 3 | Cashup tracer bullet — upload → parse → ingest → drill-down | `dadce13` |
| 4 | Royalty report-type — channel mix + 8% royalty due | `a5a4adb` |
| 5 | Gross Profit report-type — GP%/FC%, 152-row stock variance set | `5293cac` |
| 6 | Stock Variance + Stock Wastage — 201-row provider, waste cost | `a29bdd7` |
| 7 | Control Tower landing + per-Store sales target | `e91b259` |
| 8 | Multi-file batch upload — provenance + Store Day completeness | `48166e6` |
| 9 | Daily exception-alert digest email (Convex cron → Resend) | `3df4227` |
| 10 | Huashu design pass — Twenty-faithful dashboard across all 3 screens | `bb19af5` |
| — | Next 16 middleware/proxy crash fix + api.d.ts regen | `784cb0c` |

**All 5 PDF parsers done:** Cashup, Royalty, Gross Profit, Stock Variance, Stock Wastage.
Money = integer cents, dates = YYYY-MM-DD, TZ = Africa/Johannesburg (SAST = UTC+2).

**Verification status (last full run):** web 17/17, backend 38/38, `check-types` clean both
packages, `ultracite` green on changed files.

---

## Today's work

1. **Started dev server** (`corepack pnpm run dev`) — web on :3001, Convex on
   `beloved-raccoon-261`. Both came up clean.
2. **Fixed a real startup crash.** Next.js 16.2.9 throws an unhandled rejection when both
   `middleware.ts` and `proxy.ts` exist — Next 16 deprecated `middleware` → `proxy` and refuses
   to run with both. The two were identical Clerk middleware. Removed the deprecated
   `middleware.ts`, kept `proxy.ts`. App now serves 200. (Committed in `784cb0c`.)
3. **Verified live:** Home `/` shows "API Status: **Connected**" (Convex wired). `/dashboard`
   correctly resolves to the Clerk **Sign in** gate — auth gating works as designed.

---

## Blocked / Needs You

**The authenticated dashboard screenshots are blocked.** The Control Tower + drill-down live
behind Clerk sign-in, and there are no test credentials in `apps/web/.env`
(`E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD`). Without them I can only screenshot the
sign-in gate, not the actual Twenty design.

To unblock (either is fine):
- **Drop test creds** into `apps/web/.env` — a Clerk user belonging to exactly one Org — and the
  deferred Playwright e2e (`apps/web/e2e/store-drill-down.spec.ts`) can finally run live, plus I
  can capture real desktop/mobile shots for the formal huashu ≥7 design scoring.
- **Or sign in yourself** at http://localhost:3001/dashboard and we screenshot your session.

> Note: every prior slice deferred live e2e for this same reason (Clerk-gated + needs live
> Convex). It's the one outstanding test-coverage gap.

---

## Heads-up / minor

- **Root `/` is still the Better-T-Stack scaffold page** — the app lives at `/dashboard`. If you
  want `/` to land on the app, it's a one-line redirect (`app/page.tsx`). Not done yet — flagged,
  awaiting your call.
- `api.d.ts` was regenerated to drop a stale `lib/format` ref (file deleted back in slice-9) —
  folded into `784cb0c`.

---

## Next up — Issue #11 (open, not started)

Run `gh issue view 11` for scope. Thresholds (PRD §7) all live in `convex/lib/thresholds.ts` and
are fully wired: sales −10% Watch / −20% Critical vs target; GP% <55% Watch / <50% Critical; cash
var ≥R30/≥R100; stock var −R100/−R300.

**Per-slice ritual** (from MEMORY.md): parser/query → convex-test → upload/UI → e2e →
`corepack pnpm -F @pos-pro/backend test` + web vitest + check-types both +
`corepack pnpm dlx ultracite check <files>` → commit `feat(slice-N):` → `gh issue close N` →
update MEMORY block. Run `corepack pnpm exec convex codegen` in `packages/backend` after adding
Convex fns.

---

## How to run locally

```bash
corepack pnpm run dev        # web :3001 + Convex dev
# app:    http://localhost:3001/dashboard  (Clerk sign-in)
# health: http://localhost:3001/           (scaffold, "API Status: Connected")
```

Source of truth docs: `docs/project-brief.md`, `CONTEXT.md` (glossary), `docs/prd.md`,
`docs/tickets.md`, `docs/adr/`, `DEBT.md`, `ERROR_LOG.md`.
