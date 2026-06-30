# The "at least one super-user must remain" invariant is enforced best-effort in Clerk

Super-user status lives in Clerk `publicMetadata.superuser` (ADR-0005), and the
Clerk→Convex session token mirrors it. The grant/revoke action (`setSuperuser`) guards
two things server-side: no one can demote themselves, and the **last** super-user can't
be demoted — otherwise the roster empties and no one can administer access through the UI.

The last-super-user guard is a **pre-check**: read the current super-users from Clerk's
user list, and reject the demote if the target is the only one. Clerk's list endpoint is
**eventually consistent**, so two super-users demoting each other in the same instant can
both pass the pre-check and empty the roster. We accept this residual race deliberately.

Status: accepted

## Considered options
- **Pre-check only (chosen).** One list read on the demote path, reject if `size <= 1`.
  Best-effort: narrows the window but cannot fully close it against an eventually-consistent
  read.
- **Pre-check + post-write recount-and-rollback** — rejected. This was the original
  hardening attempt. It re-reads the roster *after* the write and re-promotes the target if
  the count hit zero. It does not work: the post-write read is the same eventually-consistent
  list, so under true concurrency it returns stale data and never rolls back — while paying a
  second full list scan (latency + quota) and, in the panel, forcing a Switch remount that
  dropped keyboard focus. Cost paid, race not closed.
- **Move the roster to an authoritative Convex table, enforce the invariant in a
  serializable mutation, mirror to Clerk** — rejected. Convex mutations *would* close the
  race correctly (OCC-serialized), but the session token reads the flag from Clerk, so every
  Convex write must mirror back to Clerk. That mirror can fail after commit, creating a
  permanent two-system drift-and-reconcile burden (scheduled repair / retrying action) to
  defend the same near-impossible event. A worse, always-on cost than the race it removes.

## Consequences
- The race is real but **benign and bounded**: the operator population is tiny (a handful),
  simultaneous mutual demotes are ~never, and the worst case is fully recoverable out-of-band
  — set `publicMetadata.superuser = true` on any user in the Clerk dashboard (~30s), which the
  operator already has access to. No data loss, no security exposure.
- The panel additionally **disables** the toggle for the last super-user and for self, so the
  common path never reaches the server guard. Division of labour: UX affordance in the
  component, invariant enforcement on the server.
- The guard scans up to `USER_SCAN_LIMIT = 500` users (one Clerk page). If the user
  population ever exceeds that, the count would miss off-page super-users; revisit the scan
  (pagination or a metadata-filtered count) before then.
