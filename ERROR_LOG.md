# Error Log

Living record of anything that goes awry during build and deployment: failed builds,
type errors, failed migrations, parse failures on real files, deploy failures, runtime
errors, and how each was resolved. Append newest at the top. Keep entries terse and factual.

## How to use
- Log it the moment something breaks — don't wait until it's fixed.
- One row per distinct issue. Update Status/Resolution when resolved.
- `Phase`: which build-flow phase (1 Grill … 7 Longevity) or "Deploy" / "Runtime".
- `Status`: open | resolved | wontfix | watching.

| Date | Phase | What went wrong | Root cause | Resolution | Status |
|---|---|---|---|---|---|
| 2026-06-23 | 4 Build | `pnpm -F web test` (vitest) failed after adding Playwright e2e specs. | Vitest's default `include` (`**/*.{test,spec}.*`) swept up `apps/web/e2e/*.spec.ts`, which import `@playwright/test` and can't run under vitest. | Scoped vitest to `include: ["src/**/*.test.ts"]` in `apps/web/vitest.config.ts`; Playwright specs run only via `pnpm -F web test:e2e`. | resolved |
| 2026-06-23 | 2 Database | `convex codegen` / `deployment create local` fail: "requires logging in". Blocks regenerating `_generated/api` (stale, missing `stores`) and verifying the schema deploys. | No Convex deployment configured; CLI v1.41 requires `convex login` (browser auth) even for a local deployment. External credential only the user can provide. | User logged in via `npx convex dev`, which created a NEW deployment `dev:beloved-raccoon-261` (team buildmore-123, project backend) — not the `precise-owl-528` the dev first supplied. Aligned `apps/web/.env` to the new deployment. Push then failed twice: (1) `CLERK_JWT_ISSUER_DOMAIN` unset on the deployment → set via `convex env set` to `https://shining-minnow-95.clerk.accounts.dev` (decoded from the Clerk pk); (2) deploy typecheck included `stores.test.ts` (vite/client types) → excluded `**/*.test.ts` in `convex/tsconfig.json`. Schema then deployed cleanly; types regenerated. | resolved |
| 2026-06-23 | 2 Database | `turbo check-types` failed "Unable to find package manager binary"; web typecheck failed on missing `clsx`/`tailwind-merge`; `packages/ui` had no node_modules. | pnpm not on PATH (corepack shim absent); workspace not fully installed; unused dead file `apps/web/src/lib/utils.ts`; unused `React` import in `packages/ui/.../scroll-area.tsx`. | `corepack enable pnpm`; `pnpm install`; deleted dead `apps/web/src/lib/utils.ts`; removed unused import. check-types now 3/3 green. | resolved |
