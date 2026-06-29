# File naming: kebab-case everywhere, camelCase under `convex/**`

The project convention is **kebab-case** for filenames across the monorepo. Convex is the
single, deliberate exception: every file under `packages/backend/convex/**` is registered as
a module on the generated `api` / `internal` object, and Convex **forbids hyphens in module
paths** (only alphanumerics, underscores, and periods are allowed). A multi-word function
file therefore cannot be kebab-cased without breaking codegen and every `api.*` / `internal.*`
reference, so those files use **camelCase** instead (e.g. `digestData.ts`, `storeDays.ts`,
`storeMonths.ts`, `emails/digestEmail.tsx`). Convex's constraint wins; the kebab-case rule
does not apply inside `convex/**`.

This is enforced, not just documented: `biome.jsonc` scopes
`style.useFilenamingConvention: "off"` to `packages/backend/convex/**`, with the same
rationale recorded inline. Linting stays strict (kebab-case) for the rest of the repo.

Consequence for the backlog: issue **#19 ("rename Convex files to kebab-case") is a
wontfix** — its premise contradicts this constraint. Every multi-word Convex module is
already correctly camelCase, and there is nothing valid to rename. The audit behind this ADR
confirmed zero naming inconsistencies under `convex/**`. This ADR exists so the contradiction
is settled once rather than re-discovered each session.

Status: accepted
