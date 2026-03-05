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
| `/api/events/[id]` | PATCH | Yes (all requests) | Yes — if setting `teams_approved_at` or modifying `needs_*` on self-service events |

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
