# Event Attachments

Admins can upload, view, replace, and delete files attached to events (setup diagrams, contracts, photos, etc.).

## Storage

- **Bucket**: `ops-event-attachments` (Supabase Storage, private)
- **Path convention**: `events/<event_id>/<attachment_id>/<original_filename>`
- Files are served via **signed URLs** (1-hour expiry, regenerated on demand)
- The browser never accesses the bucket directly; all operations go through server API routes using the admin (service role) client

## Schema

Table: `ops_event_attachments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| event_id | uuid | FK → ops_events(id) ON DELETE CASCADE |
| storage_path | text | Full path inside bucket |
| file_name | text | Original filename |
| content_type | text | MIME type |
| size_bytes | bigint | File size |
| description | text | User-provided description |
| uploaded_by | text | Uploader's email |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

Migration: `migrations/015_event_attachments.sql`

## API Endpoints

All endpoints require authentication via `verifyApiAuth(request)`. Upload/delete/replace require admin role.

### `GET /api/events/[id]/attachments`
List all attachments for an event. Returns `{ data: EventAttachment[] }`.

### `POST /api/events/[id]/attachments`
Upload a new attachment. **Admin only.** Multipart form data with fields:
- `file` (required): the file
- `description` (optional): text description

Returns `{ data: EventAttachment }` with status 201.

### `DELETE /api/events/[id]/attachments/[attachmentId]`
Delete an attachment (storage object + DB record). **Admin only.**

### `PATCH /api/events/[id]/attachments/[attachmentId]`
Two modes based on Content-Type:

**File replace** (`multipart/form-data`): Deletes old storage object, uploads new file, updates DB record. Admin only. Fields:
- `file` (required): replacement file
- `description` (optional): updated description

**Description update** (`application/json`): Updates description only. Admin only. Body:
```json
{ "description": "new description" }
```

### `GET /api/events/[id]/attachments/[attachmentId]/signed-url`
Returns a signed URL for viewing/downloading the file. Any authenticated user with portal access. Response:
```json
{ "url": "https://...", "file_name": "setup.pdf" }
```
Signed URL expires after 1 hour.

## Auth Rules

| Action | Who |
|--------|-----|
| View/download | Any authenticated ops user |
| Upload | Admin only |
| Replace | Admin only |
| Delete | Admin only |

Admin = `ops_users.role === 'admin'` OR exists in `super_admins` table (via `verifyApiAuth`).

### Event-ID Binding (cross-event isolation)

All attachment operations must be scoped by both `attachment_id` and `event_id` (even after a successful SELECT), to prevent cross-event mutation if control flow changes in the future. Every `[attachmentId]` route query includes `.eq('event_id', id)` — both on the initial lookup **and** on every mutating statement (DELETE, UPDATE). This means an attachment belonging to event B can never be read, modified, or deleted through event A's URL path, even if the caller knows the attachment UUID.

## Setup Instructions

### 1. Run the migration
```sql
-- Run in Supabase SQL editor or via CLI:
-- contents of migrations/015_event_attachments.sql
```

### 2. Create the storage bucket
In Supabase Dashboard → Storage:
1. Click "New bucket"
2. Name: `ops-event-attachments`
3. Public: **OFF** (private)
4. File size limit: 10 MB (recommended)
5. Save

No additional RLS policies needed on the bucket — all storage operations use the service role client server-side.

## Versioning / Replace Behavior

Replace overwrites: the new file is uploaded first (with `upsert: true` to handle same-filename replacements), then the old storage object is deleted only after the new upload succeeds. This prevents orphaning the old file if the upload fails. The DB record is updated in place (`file_name`, `storage_path`, `content_type`, `size_bytes`, `updated_at`). There is no version history — if version tracking is needed later, a `version` column can be added.

## Audit Logging

All attachment operations are logged via `logAudit()`:
- `entity_type`: `ops_events`
- `entity_id`: the event's ID
- `metadata.operation`: `upload` | `delete` | `replace` | `update_description`
- `metadata.attachment_id`, `metadata.file_name`, `metadata.storage_path`

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | No valid session | Ensure middleware.ts is deployed; user must be logged in |
| 403 Forbidden | Non-admin trying to upload/delete | Only admins can modify attachments |
| 404 Attachment not found | Wrong ID or already deleted | Refetch the attachment list |
| Upload failed: bucket not found | Storage bucket not created | Create `ops-event-attachments` bucket in Supabase Dashboard |
| Upload failed: Payload too large | File exceeds Vercel body limit (~4.5 MB) | Use smaller files or increase Vercel plan limit |
| Signed URL error | Storage path mismatch or bucket permissions | Check that storage_path in DB matches actual object path |

## File Size Limits

- Vercel serverless functions have a ~4.5 MB request body limit on the Hobby plan (up to 100 MB on Pro)
- The Supabase bucket file size limit is configurable in Dashboard (recommended: 10 MB)
- For files larger than the Vercel limit, a client-side direct upload pattern with signed upload URLs would be needed (not implemented)
