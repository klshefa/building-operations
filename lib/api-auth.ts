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
 * Verify API request authentication
 * 
 * Checks:
 * 1. User has valid session
 * 2. User email is @shefaschool.org
 * 3. User exists in ops_users table (or super_admins)
 * 
 * @returns AuthResult on success, AuthError on failure
 */
export async function verifyApiAuth(): Promise<AuthResult | AuthError> {
  try {
    // Get session using anon key client
    const supabase = await createServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user?.email) {
      return { error: 'Unauthorized - no valid session', status: 401 }
    }

    // Check domain
    if (!user.email.endsWith('@shefaschool.org')) {
      return { error: 'Unauthorized - invalid domain', status: 401 }
    }

    // Check ops_users table using admin client (to bypass RLS)
    const adminClient = createAdminClient()
    const { data: opsUser } = await adminClient
      .from('ops_users')
      .select('role, teams, is_active')
      .eq('email', user.email.toLowerCase())
      .eq('is_active', true)
      .maybeSingle()

    if (opsUser) {
      return {
        user: { email: user.email, id: user.id },
        role: opsUser.role,
        teams: opsUser.teams || [],
        isAdmin: opsUser.role === 'admin'
      }
    }

    // Fallback: check super_admins
    const { data: superAdmin } = await adminClient
      .from('super_admins')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()

    if (superAdmin) {
      return {
        user: { email: user.email, id: user.id },
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
