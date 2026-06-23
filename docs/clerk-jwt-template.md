# Clerk "convex" JWT template

Convex authenticates requests by verifying a Clerk JWT issued from a template
**named exactly `convex`** (this name is the `applicationID` in
`packages/backend/convex/auth.config.ts`). The template's custom claims are
what `convex/lib/authz.ts` reads off `ctx.auth.getUserIdentity()`:

- `superuser` → drives cross-org access (the owner and any super-user).
- `org_id` → the active Clerk Organization = the caller's Store boundary.

## Create it

Clerk Dashboard → **JWT Templates** → **New template** → **Convex** preset
(or Blank). Name it `convex`. Leave the default lifetime/issuer. Paste the
following into the **Claims** editor:

```json
{
  "superuser": "{{user.public_metadata.superuser}}",
  "org_id": "{{org.id}}"
}
```

Save. Copy the **Issuer** URL shown on the template — that is the value for
`CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
```

## Notes

- `{{user.public_metadata.superuser}}` resolves to `true` only when the
  user's Clerk `publicMetadata.superuser` is set (ADR-0005 — toggled in the
  Clerk dashboard, no in-app admin screen for MVP). When unset the claim is
  omitted, and `authz.ts` treats it as `false` (`identity.superuser === true`).
- `{{org.id}}` is populated only when an Organization is active in the
  session. A user with no active org gets `org_id` omitted → `getPermittedStores`
  returns `[]` for non-super-users.
- Clerk's standard claims (`sub`, `iss`, `iat`, `exp`) are added automatically;
  `sub` surfaces as `identity.subject`.
