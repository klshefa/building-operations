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
