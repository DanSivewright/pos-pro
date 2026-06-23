# Stack overrides the buildmore-engineering standard stack

The buildmore-engineering constitution prescribes Drizzle + PostgreSQL/Neon + BetterAuth.
The pos-pro project brief is canonical and mandates a different, already-scaffolded stack:
**Convex** (source of truth for all data), **Clerk** (the only auth, org-per-store),
**Next.js App Router**, **shadcn/ui**, deployed to **Vercel**. We follow buildmore's
*posture* (grilling-first, feedback loops, adversarial reviews, living docs, phase gates)
but its *stack* is overridden by the brief.

Status: accepted

## Considered options
- buildmore standard stack (Drizzle/Postgres/BetterAuth) — rejected: contradicts the brief's
  hard constraints (Convex as source of truth, Clerk-only auth) and would mean re-scaffolding.
- Brief's Better-T-Stack (Convex + Clerk) — chosen: already scaffolded, satisfies all §3 constraints.
