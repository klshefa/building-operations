# Building Operations — API Auth Notes

## What broke (2026-02-25)

After adding `verifyApiAuth()` to `PATCH /api/events/[id]`, both **Save Changes** and **Approve & Notify Teams** returned `401 Unauthorized - no valid session`.

### Root cause

`verifyApiAuth()` used the server-side Supabase client (`lib/supabase/server.ts`) which reads auth from **cookies** via `next/headers`. However:

1. The app has **no Next.js middleware** to refresh Supabase session cookies on each request.
2. The browser client (`lib/supabase/client.ts`) sets cookies with `domain=.shefaschool.org` in production. If the deployment domain doesn't match (e.g. `*.vercel.app`), cookies aren't sent at all.
3. Even when cookies are sent, expired access tokens aren't refreshed without middleware.

Result: `supabase.auth.getUser()` on the server always failed → 401.

## The fix

`verifyApiAuth(request?)` now supports two auth paths:

| Priority | Method | How it works |
|----------|--------|--------------|
| 1 | **Bearer token** | Reads `Authorization: Bearer <access_token>` from request headers. Validates via `adminClient.auth.getUser(token)`. |
| 2 | **Cookie session** | Falls back to cookie-based `createServerClient()` → `getUser()`. Works if middleware is added later. |

### Client side

All `fetch()` calls to protected routes must include the access token:

```ts
const supabase = createClient()  // browser client
const { data: { session } } = await supabase.auth.getSession()

fetch('/api/events/<id>', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify(payload),
})
```

A shared `getAuthHeaders()` helper in `app/event/[id]/page.tsx` handles this for Save and Approve calls.

## Protected routes

| Route | Method | Auth required | Admin required |
|-------|--------|---------------|----------------|
| `/api/events/[id]` | PATCH | Yes (all requests) | Yes — if setting `teams_approved_at` (any event) or modifying `needs_*` on self-service events |

## Pitfalls

- **Token expiry**: `getSession()` auto-refreshes the access token on the browser side, so the token passed to the server is always fresh. If you use `session.access_token` from a stale reference, it may have expired (1 hour TTL). Always call `getSession()` immediately before the fetch.
- **SSR / Server Components**: The Bearer path requires a `Request` object. Server Components don't have one — use the cookie fallback path (add middleware if needed).
- **Other portals**: This pattern is specific to Building Operations. Other portals may use different auth strategies.

---

## Follow-up regression (2026-02-25, post-Bearer-fix)

### Symptoms

1. **Save Changes did nothing**: clicking Save appeared to do nothing; refresh showed no changes.
2. **Approve button missing**: the "Teams Pending Approval" banner showed but the "Approve & Notify Teams" button was absent for admins.

### Root cause: Save

`saveEvent()` sends `JSON.stringify(event)` — the **entire event object** — as the PATCH body. This means the body always contains `teams_approved_at` (value `null`) and all `needs_*` flags (unchanged). The admin gate checked for **key presence** (`'teams_approved_at' in body`), which was always true. For non-admin users this returned 403. For admin users the gate passed but `teams_approved_at: null` was written back, potentially resetting an approved event.

**Fix**: Changed the admin gate to compare values against the current DB row. The gate only triggers when `teams_approved_at` or `needs_*` flags actually **differ** from their current values.

### Root cause: Approve button

The UI admin check calls `/api/auth/check-access` which only queried `ops_users.role`. It did **not** check the `super_admins` table. Users who are admin via `super_admins` (but whose `ops_users.role` is not `'admin'`) were shown `isAdmin = false`, hiding the button. Meanwhile, the server-side `verifyApiAuth()` correctly checks both tables.

**Fix**: Added `super_admins` fallback to `/api/auth/check-access`, matching `verifyApiAuth()` behavior.

### Files changed

| File | Change |
|------|--------|
| `app/api/events/[id]/route.ts` | Admin gate now compares values, not key presence |
| `app/api/auth/check-access/route.ts` | Added `super_admins` fallback for admin role |
| `app/event/[id]/page.tsx` | Save error now shows actual server message (was silent) |
| `docs/auth-notes.md` | This section |

---

## Persistent 401 regression — missing middleware.ts (2026-02-25)

### Symptoms

Despite the Bearer token fix and admin gate fix, Save and Approve still returned `401 Unauthorized - no valid session`. The error appeared in the UI immediately after clicking Save.

### Root cause

The app was missing the **standard Supabase SSR middleware** (`middleware.ts`). This is a required component of the `@supabase/ssr` pattern for Next.js:

1. The OAuth callback (`app/auth/callback/route.ts`) stores session tokens in cookies
2. These tokens expire after ~1 hour (Supabase default)
3. **Without middleware**, there is no mechanism to refresh expired tokens before they reach API routes or `getSession()` calls
4. `getSession()` reads the expired token from cookies and returns it as-is
5. The expired token is sent as a Bearer token to the server
6. Server calls `adminClient.auth.getUser(expired_token)` which fails
7. Cookie fallback also fails because cookies contain the same expired token
8. Result: 401 on every authenticated request after ~1 hour

This is a [known issue](https://github.com/supabase/ssr/issues/107) with `@supabase/ssr` on Next.js 14.2+ / 15+ / 16+.

### Fix

1. **Added `middleware.ts`**: Refreshes Supabase session cookies on every request. This is the standard pattern from the Supabase SSR docs. The middleware calls `supabase.auth.getUser()` which triggers a token refresh if expired, and writes the fresh tokens back to the response cookies.

2. **Made `getAuthHeaders()` more robust**: If `getSession()` returns null, it now tries `refreshSession()` as a fallback before giving up. Also logs a warning if no session is available.

3. **Added diagnostic logging to `resolveUser()`**: Server-side logs now show whether auth succeeded via Bearer token or cookies, and the exact error if it failed. Visible in Vercel function logs.

### Files changed

| File | Change |
|------|--------|
| `middleware.ts` | **New** — standard Supabase session refresh middleware |
| `lib/api-auth.ts` | Diagnostic logging in `resolveUser()` |
| `app/event/[id]/page.tsx` | `getAuthHeaders()` tries `refreshSession()` fallback |
| `docs/auth-notes.md` | This section |

### Why the earlier Bearer token fix didn't work

The Bearer token fix was correct in concept but incomplete in execution. `getAuthHeaders()` calls `getSession()` which reads from cookies. If the cookie contains an expired access token, `getSession()` in `@supabase/ssr` v0.8 returns the expired session. The expired token is then sent as a Bearer token, which the server correctly rejects. The middleware fixes this by ensuring cookies always contain fresh tokens before any page or API route runs.

---

## Double-send + Approve button disappear fix (2026-02-25)

### Symptoms

1. **Team assignment emails sent twice**: toggling a team on Save emailed that team immediately (even pre-approval), then clicking Approve emailed all teams again — including the ones already notified.
2. **Approve button disappeared after approval**: once `teams_approved_at` was set, the entire approval banner was replaced by a small "Approved" badge with no button, making it impossible to confirm the approval action was taken.

### Root cause: double emails

The PATCH handler's team email logic had two branches but no gate for unapproved self-service events:

```
if (isApprovalTransition) → email all currently-true teams
else → email teams that transition false→true
```

The `else` branch fired on Save even when the self-service event hadn't been approved yet, sending emails to newly-toggled teams. Then Approve sent to ALL teams again (including those already notified by Save).

### Root cause: disappearing button

The UI used two mutually-exclusive render blocks:

```
{requested_by && !teams_approved_at && (...button...)}
{requested_by && teams_approved_at && (...badge only...)}
```

Once approved, the first block (with the button) unmounted entirely.

### Fix

**Server** (`app/api/events/[id]/route.ts`): Added an `isPendingSelfService` gate. When `isSelfServiceEvent && currentEvent.teams_approved_at == null`, the `else` branch is skipped — no team emails on Save. Only the `isApprovalTransition` branch can send emails for unapproved self-service events.

**UI** (`app/event/[id]/page.tsx`): Merged the two blocks into a single `{event.requested_by && (...)}` block. When pending: blue banner + active Approve button. When approved: green banner + disabled "Approved" button with timestamp.

### Final email behavior

| Scenario | Behavior |
|----------|----------|
| Self-service, not approved: Save with team changes | Teams saved, **no emails** |
| Self-service, Approve clicked | Emails ALL currently-true teams once |
| Self-service, already approved: add new team + Save | Emails **only** the newly-added team |
| Admin-created event: add team + Save | Emails the newly-added team |

### Files changed

| File | Change |
|------|--------|
| `app/api/events/[id]/route.ts` | Added `isPendingSelfService` gate to skip emails on Save |
| `app/event/[id]/page.tsx` | Unified approval banner; button stays visible + disabled after approval |
| `docs/auth-notes.md` | This section |

---

## Notify Teams expanded to all events (2026-02-25)

### What changed

The "Approve & Notify Teams" panel was previously restricted to self-service events (`requested_by != null`). It is now available on **all events** for admins, regardless of event source (calendar sync, manual, Veracross, etc.).

### Why

Admins frequently add teams to calendar-synced events and need to notify those team members. Previously there was no explicit notification control — team emails were sent silently on Save (false→true), but the admin had no visibility into whether notifications were sent.

### UI behavior

The panel now shows for all events when the user is admin:

| Event type | State | Panel heading | Button |
|------------|-------|---------------|--------|
| Self-service | Pending | "Self-Service Request — Teams Pending Approval" | "Approve & Notify Teams" |
| Self-service | Approved | "Teams Notified" + requester + timestamp | "Notified" (disabled) |
| Non-self-service | Not yet notified | "Team Notifications" | "Notify Teams" |
| Non-self-service | Notified | "Teams Notified" + timestamp | "Notified" (disabled) |

Non-admin users do not see the panel at all (server enforces 403 if attempted).

### Email sending rules (complete)

| Scenario | Behavior |
|----------|----------|
| Admin creates event via portal with teams | Teams emailed immediately; `teams_approved_at` auto-set |
| Self-service, not approved: Save with team changes | Teams saved, **no emails** (deferred to approval) |
| Self-service: Approve clicked | Emails ALL currently-true teams once |
| Self-service, already approved: add new team + Save | Emails **only** the newly-added team |
| Calendar/synced event: add team + Save (first time) | Emails the newly-added team; `teams_approved_at` auto-set |
| Any event, already notified: add new team + Save | Emails **only** the newly-added team |
| Notify Teams clicked (any event, teams_approved_at null) | Emails ALL currently-true teams once |

### Double-send prevention

`teams_approved_at` is automatically set when team emails are sent, even outside the explicit "Notify" button flow. This prevents a scenario where teams are emailed on Save and then re-emailed via the Notify button. Specifically:

- `POST /api/events/manual`: after sending team emails on create, sets `teams_approved_at`
- `PATCH /api/events/[id]`: after sending team emails via the normal false→true path on a non-self-service event with `teams_approved_at = null`, auto-sets `teams_approved_at`

### Files changed

| File | Change |
|------|--------|
| `app/event/[id]/page.tsx` | Panel no longer gated by `requested_by`; shows for all events (admin-only); wording adapts to event type |
| `app/api/events/[id]/route.ts` | Auto-sets `teams_approved_at` after sending team emails on non-self-service events |
| `app/api/events/manual/route.ts` | Auto-sets `teams_approved_at` after sending team emails on create |
| `docs/auth-notes.md` | This section |
