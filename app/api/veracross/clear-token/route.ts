import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST() {
  try {
    const supabase = getSupabaseClient()
    
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
