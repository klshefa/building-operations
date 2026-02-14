import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

export async function POST() {
  // Verify authentication - admin only
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const supabase = createAdminClient()
    
    // Delete the cached token
    const { error } = await supabase
      .from('veracross_tokens')
      .delete()
      .eq('id', 'default')
    
    if (error) {
      console.error('Error clearing token cache:', error)
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Token cache cleared. Next API call will fetch a fresh token.' 
    })
  } catch (error) {
    console.error('Error clearing token cache:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
