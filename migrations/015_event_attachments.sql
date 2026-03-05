-- Event attachments: files uploaded by admins to events
CREATE TABLE IF NOT EXISTS ops_event_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ops_events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  description TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON ops_event_attachments(event_id);

-- Storage bucket must be created via Supabase Dashboard or CLI:
--   Bucket name: ops-event-attachments
--   Public: false (private)
--   File size limit: 10 MB (recommended)
--   Allowed MIME types: (leave unrestricted or set per policy)
