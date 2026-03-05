import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth, isAuthError } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

const BUCKET = 'ops-event-attachments'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await verifyApiAuth(request)
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ops_event_attachments')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await verifyApiAuth(request)
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Request must be multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const description = (formData.get('description') as string) || ''

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify event exists
  const { data: event, error: eventErr } = await supabase
    .from('ops_events')
    .select('id')
    .eq('id', id)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const attachmentId = crypto.randomUUID()
  const storagePath = `events/${id}/${attachmentId}/${file.name}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadErr) {
    console.error('[Attachments] Storage upload error:', uploadErr)
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: record, error: dbErr } = await supabase
    .from('ops_event_attachments')
    .insert({
      id: attachmentId,
      event_id: id,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      description: description || null,
      uploaded_by: auth.user.email,
    })
    .select()
    .single()

  if (dbErr) {
    // Clean up orphaned storage object
    await supabase.storage.from(BUCKET).remove([storagePath])
    console.error('[Attachments] DB insert error:', dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  await logAudit({
    entityType: 'ops_events',
    entityId: id,
    action: 'UPDATE',
    userEmail: auth.user.email,
    apiRoute: '/api/events/[id]/attachments',
    httpMethod: 'POST',
    metadata: {
      attachment_id: attachmentId,
      operation: 'upload',
      file_name: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
    },
  })

  return NextResponse.json({ data: record }, { status: 201 })
}
