import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service role client for data operations that need to bypass RLS
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface AuthResult {
  user: {
    email: string
    id: string
  }
  role: string
  teams: string[]
  isAdmin: boolean
}

export interface AuthError {
  error: string
  status: number
}

/**
 * Extract the Supabase user from either a Bearer token or server-side cookies.
 *
 * Priority:
 *  1. Authorization: Bearer <access_token>  (reliable from client-side fetch)
 *  2. Cookie-based session via createServerClient (requires middleware for refresh)
 *
 * Passing the incoming Request is strongly recommended so the Bearer path can
 * be used; the cookie path is kept as a fallback for server-component callers.
 */
async function resolveUser(request?: Request) {
  // 1. Try Bearer token from request headers
  if (request) {
    const authHeader = request.headers.get('authorization') || ''
    const hasBearer = authHeader.startsWith('Bearer ')

    if (hasBearer) {
      const token = authHeader.slice(7).trim()
      const adminClient = createAdminClient()
      const { data: { user }, error } = await adminClient.auth.getUser(token)
      if (!error && user?.email) {
        console.log('[resolveUser] Authenticated via Bearer token:', user.email)
        return { user, source: 'bearer' as const }
      }
      console.warn('[resolveUser] Bearer token present but validation failed:', error?.message)
    } else {
      console.log('[resolveUser] No Authorization header in request')
    }
  }

  // 2. Fallback: cookie-based session (requires middleware for token refresh)
  try {
    const supabase = await createServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user?.email) {
      console.log('[resolveUser] Authenticated via cookie session:', user.email)
      return { user, source: 'cookie' as const }
    }
    console.warn('[resolveUser] Cookie session failed:', error?.message)
  } catch (e: unknown) {
    console.warn('[resolveUser] Cookie path threw:', e instanceof Error ? e.message : e)
  }

  return null
}

/**
 * Verify API request authentication
 *
 * Checks:
 * 1. User has valid session (Bearer token or cookie)
 * 2. User email is @shefaschool.org
 * 3. User exists in ops_users table (or super_admins)
 *
 * @param request - The incoming Request object (pass this so Bearer tokens work)
 * @returns AuthResult on success, AuthError on failure
 */
export async function verifyApiAuth(request?: Request): Promise<AuthResult | AuthError> {
  try {
    const resolved = await resolveUser(request)

    if (!resolved?.user?.email) {
      return { error: 'Unauthorized - no valid session', status: 401 }
    }

    const email: string = resolved.user.email
    const userId: string = resolved.user.id

    // Check domain
    if (!email.endsWith('@shefaschool.org')) {
      return { error: 'Unauthorized - invalid domain', status: 401 }
    }

    // Check ops_users table using admin client (to bypass RLS)
    const adminClient = createAdminClient()
    const { data: opsUser } = await adminClient
      .from('ops_users')
      .select('role, teams, is_active')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .maybeSingle()

    if (opsUser) {
      return {
        user: { email, id: userId },
        role: opsUser.role,
        teams: opsUser.teams || [],
        isAdmin: opsUser.role === 'admin'
      }
    }

    // Fallback: check super_admins
    const { data: superAdmin } = await adminClient
      .from('super_admins')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (superAdmin) {
      return {
        user: { email, id: userId },
        role: 'admin',
        teams: [],
        isAdmin: true
      }
    }

    return { error: 'Forbidden - no access to Building Operations', status: 403 }
  } catch (error: any) {
    console.error('API auth error:', error)
    return { error: 'Authentication failed', status: 500 }
  }
}

/**
 * Helper to check if result is an error
 */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'error' in result
}
