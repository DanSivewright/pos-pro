# Super-users are designated by a Clerk publicMetadata flag

A super-user has cross-org (all-Store) access. Because Clerk organization roles only scope
*within* a single org, a cross-cutting global role is expressed as a flag on the Clerk user's
**`publicMetadata`** (e.g. `{ "superuser": true }`), set via the Clerk dashboard/API. It is
surfaced as a custom claim in the Clerk→Convex JWT template, so every Convex function reads
it from `ctx.auth` and grants all-Store access. Authorization order in every function:
**identity (Clerk) → super-user? all Stores : active-org Store → ownership check → execute.**

Status: accepted

## Considered options
- A dedicated "HQ" Clerk org whose members are super-users — rejected: conflates "a Store"
  with "the admin group", muddying the org-per-Store model.
- `publicMetadata.superuser` flag on the Clerk user — chosen: the Clerk-native way to model a
  global role; rides in the JWT for Convex enforcement; keeps org = Store clean.

## Consequences
- Toggling super-user is a Clerk dashboard/API action for MVP (no in-app admin screen).
- Requires a custom claim in the Clerk JWT template exposing `public_metadata.superuser`.
