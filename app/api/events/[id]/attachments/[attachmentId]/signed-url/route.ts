import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth, isAuthError } from '@/lib/api-auth'

const BUCKET = 'ops-event-attachments'
const SIGNED_URL_EXPIRY = 3600 // 1 hour

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params

  const auth = await verifyApiAuth(request)
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createAdminClient()

  const { data: attachment, error: fetchErr } = await supabase
    .from('ops_event_attachments')
    .select('storage_path, file_name')
    .eq('id', attachmentId)
    .eq('event_id', id)
    .single()

  if (fetchErr || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const { data: urlData, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_EXPIRY)

  if (urlErr || !urlData?.signedUrl) {
    console.error('[Attachments] Signed URL error:', urlErr)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  return NextResponse.json({
    url: urlData.signedUrl,
    file_name: attachment.file_name,
  })
}
