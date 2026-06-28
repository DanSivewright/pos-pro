# Code review — pos-pro (AFK audit, 2026-06-28)

Audit of the extraction + ingest spine and the dashboard shell, plus a real-PDF
probe of all five parsers against every reference report in
`docs/reference/{rp-first-batch,rp-sv-forms}`. Findings ranked by severity.
Two P0s were fixed in this pass; the rest are flagged for triage.

## Method
- Read all five parsers, the shared extraction helpers, the upload route, the
  Convex ingest mutations, schema, and authz.
- Ran every reference PDF (13 files) through `extractPdfText` → `detectReportType`
  → the matching parser, recording the result of each. This is the first time
  the parsers have been exercised against PDFs other than their single fixtures.

## Probe result (all 13 reference PDFs)
- Detection is solid: all five unsupported types (Deliveries, Hourly Sales, Menu
  Item Extras, Petty Cash, Third Party) correctly returned `null` → unsupported.
- All single-day reports parsed to the cent, matching the known-good fixtures
  (Cashup net R12,571.00; Royalty due R1,005.68; GP 57.21% / 152 items; SV
  −R244.12 / 201 items; Wastage R13.24).
- The three multi-day range exports exposed a P0 (see below).

---

## P0 — fixed this pass

### 1. Multi-day range exports were silently corrupted onto their start date
**Was:** A weekly export (`..._From_01-06-2026_To_07-06-2026...`) carries a
period header `From Jun 1, 2026 to Jun 7, 2026`. `parseReportDate` matched only
the `From` date, so the parser "succeeded" and the whole week's aggregate totals
were written onto a single Store Day — **June 1**. Worst part: the Royalty 8%
self-check still passed (numerator and denominator are both weekly totals), so
the day was **not** flagged `needsReview`. Silent data corruption.

Probe evidence: range Royalty parsed to date=2026-06-01, net=**R104,853** (vs the
single-day R12,571), royaltyDue=R8,388 — no review flag.

**Fix:** `report-date.ts` now reads both period dates. When `from !== to` it
throws `Multi-day range reports are not supported — upload a single-day export
(this report covers <from> to <to>)`. The upload route already catches parser
throws and records the file as `failed` with that reason, so a range upload is
now rejected honestly instead of corrupting a day. Single-day reports
(`from === to`) are unaffected. Covered by `report-date.test.ts` (3 cases,
asserted against the real range + single PDFs).

**Follow-up (feature, not a fix):** the brief's eventual goal is to *split* a
range export across its Store Days. The range Royalty PDF does contain a per-day
table (`Date | Day | Net Sales | 2026-06-01 …`), so per-day splitting is
feasible later — but it's a per-report-type feature, not hardening. Recommend a
dedicated ticket. Until then, rejection is the correct, safe behaviour.

### 2. `pnpm check-types` was RED on master
`dashboard-shell.tsx` typed `NavItem.href` as `string`, which Next 16's
`typedRoutes: true` (next.config.ts) rejects for `<Link href>`. This regressed
after slice-10 (introduced by the Next 16 fix commit `784cb0c`; slice-10 itself
verified clean). **Fix:** typed `href` as `Route` (`import type { Route } from
"next"`). `check-types` is green again in both packages.

---

## P1 — real risks, not yet addressed (need owner)

### 3. Nothing has run end-to-end live (Clerk-creds blocker)
Every slice's Playwright e2e and all authenticated screenshots are deferred: the
dashboard is Clerk-gated and there are no test credentials. The full chain
(upload → extract → mutation → reactive query → render → cron → Resend) has
never executed once against a live deployment. **Unblock:** add
`E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` (a user in exactly one Clerk
Org) to `apps/web/.env`, then run `test:e2e`.

### 4. `unpdf` on Vercel serverless is unverified
Parsing runs in the Node route handler (`runtime = "nodejs"`). `unpdf` works
locally but PDF libraries often behave differently under serverless (memory,
cold start, fonts). Verify on a Vercel preview before relying on it.

### 5. The daily digest email has never been sent
`digest.ts` + `crons.ts` are unit-tested with pure renderers, but no real email
has gone out. The Clerk member/superuser lookups and Resend POST are untested
against live services. Verify the from-address is a verified Resend domain.

### 6. `take(200)` caps silently truncate
`authz.getPermittedStores` and `digest.dataForDigest` cap at 200 rows with no
pagination. Past 200 stores, super-user views and the digest silently drop
stores. Fine for MVP scale; flag before growth.

---

## P2 — product decisions / lower stakes

### 7. GP-overwrites-SV completeness edge
When Gross Profit ingests after Stock Variance for the same day, `itemsProvider`
flips to `grossProfit` and the SV completeness signal is lost (the day's
Completeness pill set changes). Documented as "accepted" in slice-8 — but it's a
product call worth confirming, not a settled fact.

### 8. Parser cosmetic imperfections (item-detail only, totals correct)
De-spaced category labels ("DRYGOODS", "COFFEE&TEA"), one split code leaking into
the name ("TAC-SWCUP" + "250C"), and one wrapped name losing a fragment
("MCP008 … Pops"). These affect per-item display strings only; all monetary
totals and item counts are correct to the cent. Low priority.

### 9. `detectReportType` is loose substring + order-dependent
Recognition is `text.includes(marker)` over an ordered list. Correct on all 13
real reports, but fragile: a report body that mentions another report's name
could mis-route. Consider anchoring on the report title line if drift appears.

### 10. Single-store fixture coverage
All single-day fixtures are one store ("Boitumelo"). The parsers' page-break /
category / wrapped-name logic is only proven against this one store's layout.
More confidence needs PDFs from other stores. (Range files now add coverage of
the rejection path for Royalty/SV/Wastage.)

---

## Positives worth keeping
- Detection cleanly rejects all five unsupported report types.
- Every single-day parser is correct to the cent on the real PDFs.
- Authz keys Store ownership on the JWT org claim, never on caller input; IDOR
  paths are well covered by convex-test.
- Ingest is per-file transactional; re-upload is idempotent per report-type;
  the per-item set is fully replaced by its owning provider.

## Verification of this pass
web vitest 20/20 · backend 38/38 · check-types clean (both) · ultracite clean on
changed files.
