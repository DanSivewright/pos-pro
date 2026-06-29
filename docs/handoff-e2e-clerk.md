# Handoff — Remaining work, with focus on E2E testing + Clerk

Written 2026-06-29 after the Upload History slice (`e52c491`, pushed to
`origin/master`). Read `memory/MEMORY.md` first — it has the full per-slice
history and every live-env detail. This doc is the forward-looking "what's
left", concentrating on the two things that have blocked every slice: real
end-to-end (Playwright) runs and Clerk configuration.

## Where the project stands
- **All 10 build slices (#2–#10) are CLOSED and on master.** Upload History
  (this session) was an extra read-only feature folded into `feat(uploads)`,
  not a numbered slice.
- **One GitHub issue is OPEN: #11 "Pre-ship audit + Vercel deployment"**
  (`gh issue view 11`). It is the last ticket and the natural home for the
  work below. Its acceptance criteria are: IDOR test passes, **no console
  errors on any screen + all Playwright scenarios green**, the three
  adversarial reviews done, `.env.example` complete, Vercel deploy with
  Convex+Clerk+Resend, Lighthouse baseline in `PERFORMANCE_BASELINE.md`.
- **Everything is verified by unit/convex-test + type-check + lint, but almost
  nothing has been exercised in a real browser against live infra.** That is
  the central gap. Backend 45/45, web vitest 23/23 — all green.

## The core blocker: E2E has never actually run
The Playwright harness is fully written and wired, it has just never been
executed green because it needs live infra + a Clerk test user that only the
operator can provision.

What exists already (don't rebuild):
- `apps/web/playwright.config.ts` — two projects, **desktop** (Desktop Chrome)
  + **mobile** (Pixel 5), both depending on a `setup` project; `webServer` runs
  `pnpm dev` on :3001; loads `.env` for Clerk keys.
- `apps/web/e2e/global.setup.ts` — calls `clerkSetup()` (bypasses bot
  detection via the Clerk testing token).
- `apps/web/e2e/store-drill-down.spec.ts` — **8 scenarios**: Cashup, Royalty,
  Gross Profit, Stock Variance, Stock Wastage, mixed-batch completeness,
  Control Tower tile, and (added this session) **Upload History**
  (`upload-history` / `history-row` / `history-status` testids). Each signs in
  via `clerk.signIn({ emailAddress: userEmail })`, uploads a real reference PDF
  from `docs/reference/…`, then asserts the rendered figures.
- Script: `pnpm -F web test:e2e` (= `playwright test`).
- Deps installed: `@playwright/test`, `@clerk/testing`.

### To make it run green (operator + agent, in order)
1. **Provision a Clerk test user** that belongs to **exactly one
   Organization** (so that org becomes the active Store on sign-in). Clerk's
   testing convention: an email like `<name>+clerk_test@…` with the fixed
   verification code, so `clerk.signIn` works headlessly. The user must be a
   member of one org only — multiple orgs means no single active org → the
   in-page token carries no resolvable Store and the drill-down is empty.
2. **Set env** the harness reads:
   - `E2E_CLERK_USER_EMAIL` (and `E2E_CLERK_USER_PASSWORD` if using a password
     flow) — referenced in the spec as `process.env.E2E_CLERK_USER_EMAIL`.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` in `apps/web/.env`
     (already present for dev; confirm not stale/rotated — see Clerk section).
   - `NEXT_PUBLIC_CONVEX_URL` pointing at a live deployment.
3. **Install the browser binary:** `pnpm -F web exec playwright install chromium`.
4. **Run live infra:** `corepack pnpm run dev` (web :3001 + `convex dev`
   watcher on `beloved-raccoon-261`) — or let Playwright's `webServer` start
   `pnpm dev` itself.
5. **Run:** `corepack pnpm -F web test:e2e`. Triage from there.

### Likely failure points to expect (pre-warned)
- **The in-page Convex token shape (native Clerk→Convex integration).** This
  bit us already (see MEMORY's "LIVE BUG FIXED — empty Control Tower"). The
  default session token nests org under `o:{id}` with no top-level `org_id`,
  and carries **no `superuser` claim**. `authz.ts requireCaller` was patched to
  read both shapes, so the **store-user** path works. But if e2e signs in a
  user expected to see multiple stores (super-user), it will see none — the
  super-user claim is absent from the default token. Keep e2e on a
  **single-org store user** unless the session token is customised (below).
- **`unpdf` on the server boundary at runtime.** Unit tests drive it in Node,
  but it has never run inside a live `next dev` request on Vercel. The upload
  route is Node-runtime; watch for bundling/runtime errors on first real upload.
- **Console errors** (issue #11 explicitly forbids them) — base-ui Dialog a11y
  warnings were handled in Slice #10, but re-check after a real render.

## Clerk: open threads
1. **Super-user path is dark everywhere.** No Clerk user has
   `public_metadata.superuser === true`, and the **default native session
   token doesn't carry the claim anyway**. Consequences already observed:
   - The consolidated super-user **digest email** sends to 0 recipients.
   - `isSuperuser` is false for everyone in-app → no cross-org Control Tower,
     no sales-target editing via the UI.
   Two fixes, pick per ADR-0005:
   - **Customise the session token** (Clerk Dashboard → Sessions → Edit) to add
     `{"superuser": "{{user.public_metadata.superuser}}"}`. Org is already
     present as `o`. This makes the native in-page token carry the flag.
   - OR keep using the custom **`convex` JWT template**
     (`docs/clerk-jwt-template.md` documents it: claims `superuser` + `org_id`,
     issuer → `CLERK_JWT_ISSUER_DOMAIN`). Note `ConvexProviderWithClerk` only
     uses the template when the default token's `aud !== "convex"`; with native
     integration ON the default already has `aud:"convex"`, so the template is
     bypassed in-page. The token-customisation route is the reliable one.
   Then set `public_metadata.superuser = true` on the owner user.
2. **Rotate the Clerk `sk_test`.** It was pasted into chat multiple times
   across sessions. Rotate in the Clerk dashboard and update `apps/web/.env`
   + the Convex `CLERK_SECRET_KEY` env (`mcp__convex__envSet`).
3. **Production Clerk instance.** Dev uses `shining-minnow-95.clerk.accounts.dev`
   (pk_test). For Vercel prod (#11) you need a **production Clerk instance**:
   prod publishable+secret keys, the production issuer in
   `CLERK_JWT_ISSUER_DOMAIN` on the prod Convex deployment, and the
   organizations + super-user metadata re-created there. `middleware.ts`
   (`clerkMiddleware`) is already wired.

## Other remaining work (beyond e2e + Clerk)
- **#11 Vercel deploy:** new **prod Convex deployment** (`convex deploy`), set
  all env there (`CLERK_*`, `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`,
  `DIGEST_APP_URL` → the real Vercel URL not the `localhost:3001` placeholder,
  `DIGEST_HOUR_UTC`). Confirm `.env.example` is complete. Capture Lighthouse
  (desktop+mobile) → `PERFORMANCE_BASELINE.md`. Log issues in `ERROR_LOG.md`.
- **Adversarial reviews for #11:** non-negotiables checklist, security/IDOR
  (validation→auth→ownership order), senior code review — with evidence.
- **Two fresh DEBT.md items from this session** (Upload History):
  - No cursor pagination on upload history (`.take(50)`) → switch to
    `.paginate()` + load-more.
  - `uploadedBy` shows the raw Clerk subject id, not a human name → resolve via
    a Clerk fetch in an action, or denormalise the uploader name onto the
    `uploads` row at ingest.
- **Pre-existing flagged risks** (from `docs/code-review.md` / MEMORY): the
  `take(200)` caps with no pagination on store/day lists; multi-day range PDFs
  are routed `failed` (per-day split deferred to a feature ticket); scaffold
  ultracite debt (~35 errors in vendored/demo files) tracked in DEBT.md.

## Verify ritual (unchanged, per MEMORY)
`corepack pnpm -F @pos-pro/backend test` + `corepack pnpm -F web check-types` +
`corepack pnpm -F @pos-pro/backend check-types` +
`corepack pnpm dlx ultracite check <changed files>`. Run
`corepack pnpm exec convex codegen` in `packages/backend` only after adding a
new Convex **module** file. Commit `feat(...)`/`fix(...)` only when asked; then
update `memory/MEMORY.md`.

## Suggested skills for next session
- `clerk-testing` — E2E auth flows with Playwright + `@clerk/testing` (test
  users, the `+clerk_test` convention, testing tokens).
- `clerk-orgs` / `clerk` — Organizations, session-token customisation, super-user
  metadata.
- `vercel:deploy` / `vercel:env` / `vercel:bootstrap` — the #11 Vercel deploy +
  env sync.
- `convex-realtime` / `convex-best-practices` — if converting the history query
  to `.paginate()`.
- `web-design-guidelines` — the "no console errors / a11y" pass for #11.
