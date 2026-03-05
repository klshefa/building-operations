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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params

  const auth = await verifyApiAuth(request)
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data: attachment, error: fetchErr } = await supabase
    .from('ops_event_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('event_id', id)
    .single()

  if (fetchErr || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([attachment.storage_path])

  if (storageErr) {
    console.error('[Attachments] Storage delete error:', storageErr)
  }

  const { error: dbErr } = await supabase
    .from('ops_event_attachments')
    .delete()
    .eq('id', attachmentId)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  await logAudit({
    entityType: 'ops_events',
    entityId: id,
    action: 'UPDATE',
    userEmail: auth.user.email,
    apiRoute: '/api/events/[id]/attachments/[attachmentId]',
    httpMethod: 'DELETE',
    metadata: {
      attachment_id: attachmentId,
      operation: 'delete',
      file_name: attachment.file_name,
      storage_path: attachment.storage_path,
    },
  })

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params

  const auth = await verifyApiAuth(request)
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data: attachment, error: fetchErr } = await supabase
    .from('ops_event_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('event_id', id)
    .single()

  if (fetchErr || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    // File replace: new file overwrites old
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const description = formData.get('description') as string | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided for replace' }, { status: 400 })
    }

    // Delete old storage object
    await supabase.storage.from(BUCKET).remove([attachment.storage_path])

    // Upload new file at a new path (same attachment ID, new filename)
    const newPath = `events/${id}/${attachmentId}/${file.name}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, arrayBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadErr) {
      console.error('[Attachments] Storage replace error:', uploadErr)
      return NextResponse.json({ error: `Replace upload failed: ${uploadErr.message}` }, { status: 500 })
    }

    const updateFields: Record<string, unknown> = {
      storage_path: newPath,
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      updated_at: new Date().toISOString(),
    }
    if (description !== null) {
      updateFields.description = description || null
    }

    const { data: updated, error: dbErr } = await supabase
      .from('ops_event_attachments')
      .update(updateFields)
      .eq('id', attachmentId)
      .select()
      .single()

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    await logAudit({
      entityType: 'ops_events',
      entityId: id,
      action: 'UPDATE',
      userEmail: auth.user.email,
      apiRoute: '/api/events/[id]/attachments/[attachmentId]',
      httpMethod: 'PATCH',
      metadata: {
        attachment_id: attachmentId,
        operation: 'replace',
        old_file: attachment.file_name,
        new_file: file.name,
        storage_path: newPath,
      },
    })

    return NextResponse.json({ data: updated })
  }

  // JSON body: description-only update
  const body = await request.json()
  if (typeof body.description !== 'string') {
    return NextResponse.json({ error: 'description field required' }, { status: 400 })
  }

  const { data: updated, error: dbErr } = await supabase
    .from('ops_event_attachments')
    .update({
      description: body.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attachmentId)
    .select()
    .single()

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  await logAudit({
    entityType: 'ops_events',
    entityId: id,
    action: 'UPDATE',
    userEmail: auth.user.email,
    apiRoute: '/api/events/[id]/attachments/[attachmentId]',
    httpMethod: 'PATCH',
    metadata: {
      attachment_id: attachmentId,
      operation: 'update_description',
      file_name: attachment.file_name,
    },
  })

  return NextResponse.json({ data: updated })
}
