# Client emails are authored with React Email, rendered in a Convex Node action

Client-facing emails (starting with the daily exception digest) are authored as
**React Email** (`@react-email/components`) templates and rendered to bulletproof
inline-styled HTML via `@react-email/render`. Because that renderer is a Node API
(it uses `react-dom/server`), rendering happens inside a **Convex Node-runtime
action** (`"use node"`), not the default V8 runtime. The daily cron and Resend
send path stay in Convex, preserving "Convex is the source of truth".

Status: accepted

## Decisions (from the grill)
1. **Render location — Convex Node action.** `digest.ts` is split: the
   `dataForDigest` internalQuery moves to its own file (queries cannot live in a
   `"use node"` file), and `send` becomes a Node action that renders the template
   immediately before the Resend POST. Rejected: rendering in a Next.js API route
   (adds a hop + auth surface, couples backend to the web app).
2. **Thin foundation, not a one-off.** One shared `EmailLayout` (brand chrome +
   tokens) and one `Digest` template as its first consumer. No speculative second
   template or theming system.
3. **Mobile-first email.** Designed at ~600px single column first, then confirmed
   on desktop. This is a *scoped* exception to ADR-0002 (desktop-first): ADR-0002
   governs the app's screens; email opens skew mobile and clients cap width near
   600px, so email reality wins here. Not a reversal of ADR-0002.
4. **Same content + a deep-link CTA.** Keep the validated data model (exceptions
   worst-first, clean Stores hidden) and add a per-Store "View in Control Tower"
   button that links back into the dashboard. Requires a new Convex env var
   `DIGEST_APP_URL` (the deployed app base URL). Rejected for now: an extra
   per-Store metrics grid (numbers already live in the exception messages;
   duplicates them and exposes the GP-overwrites-stock-variance edge).
5. **Align to app identity.** Indigo `#5B50E8`, Inter, the square "P" mark, warm
   neutrals — the email looks like the dashboard it links into. Red/amber/green
   (`#C8102E` / `#E8820C` / `#2E9E5B`) stay reserved strictly for severity
   semantics. Rejected: keeping the old dark "broy" header (distinct from app).

## Consequences
- `packages/backend` gains `@react-email/components` + `@react-email/render`; both
  must bundle in Convex's Node runtime (verified during build).
- `digest.send` runs in Node (heavier cold start — irrelevant for a daily cron).
- New env var `DIGEST_APP_URL` documented in `.env.example` and set on the
  deployment; the CTA degrades gracefully (omitted) when it is absent.
- `lib/digest.ts` pure exception logic (`computeExceptions`, `buildSections`) is
  unchanged; only the HTML rendering is replaced.
