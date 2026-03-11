/**
 * Supabase row types — direct table mappings.
 *
 * Each interface here corresponds to a row in a Supabase/PostgreSQL table.
 * Types are sourced from actual portal code, not auto-generated.
 */

// ---------------------------------------------------------------------------
// Building Operations — ops_events
// ---------------------------------------------------------------------------

/** @source building-operations (lib/types.ts — EventSource) */
export type EventSource =
  | 'bigquery_group'
  | 'bigquery_resource'
  | 'calendar_staff'
  | 'calendar_ls'
  | 'calendar_ms'
  | 'calendar_maintenance'
  | 'calendar_admissions'
  | 'manual'

/** @source building-operations (lib/types.ts — EventType) */
export type OpsEventType =
  | 'program_event'
  | 'meeting'
  | 'assembly'
  | 'field_trip'
  | 'performance'
  | 'athletic'
  | 'parent_event'
  | 'professional_development'
  | 'religious_observance'
  | 'fundraiser'
  | 'other'

/**
 * A row in the ops_events table (aggregated event).
 *
 * @source building-operations (lib/types.ts — OpsEvent)
 */
export interface OpsEvent {
  id: string
  title: string
  description?: string
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  all_day: boolean
  location?: string
  resource_id?: number
  event_type: OpsEventType

  expected_attendees?: number
  food_served: boolean
  food_provider?: string

  needs_program_director: boolean
  needs_office: boolean
  needs_it: boolean
  needs_security: boolean
  needs_facilities: boolean

  program_director_notes?: string
  office_notes?: string
  it_notes?: string
  security_notes?: string
  facilities_notes?: string

  setup_instructions?: string

  security_personnel_needed?: number
  building_open: boolean
  elevator_notes?: string

  techs_needed?: number
  assigned_techs?: string[]
  av_equipment?: string
  tech_notes?: string

  general_notes?: string

  is_hidden: boolean
  has_conflict: boolean
  conflict_ok: boolean
  conflict_notes?: string
  status: 'active' | 'cancelled'

  requested_by?: string
  requested_at?: string
  teams_approved_at?: string
  veracross_reservation_id?: string

  source_events: string[]
  primary_source: EventSource
  sources: EventSource[]

  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_raw_events
// ---------------------------------------------------------------------------

/**
 * A row in the ops_raw_events table (pre-aggregation sync data).
 *
 * @source building-operations (lib/types.ts — RawEvent)
 */
export interface RawEvent {
  id: string
  source: EventSource
  source_id: string
  title: string
  description?: string
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  location?: string
  resource?: string
  contact_person?: string
  reservation_id?: string
  recurring_pattern?: string
  raw_data: Record<string, unknown>
  synced_at: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_users
// ---------------------------------------------------------------------------

/** @source building-operations (lib/types.ts — TeamType) */
export type TeamType = 'program_director' | 'office' | 'it' | 'security' | 'facilities'

/** @source building-operations (lib/types.ts — UserRole) */
export type OpsUserRole = 'admin' | 'program_director' | 'office' | 'it' | 'security' | 'facilities' | 'viewer'

/**
 * A row in the ops_users table.
 *
 * @source building-operations (lib/types.ts — OpsUser)
 */
export interface OpsUser {
  id: string
  email: string
  name?: string
  role: OpsUserRole
  teams: TeamType[]
  is_active: boolean
  digest_enabled?: boolean
  notify_on_team_assignment?: boolean
  notify_on_subscribed_changes?: boolean
  notify_on_new_event?: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_resources
// ---------------------------------------------------------------------------

/**
 * A row in the ops_resources table (sourced from BigQuery).
 *
 * Renamed from Resource to OpsResource to avoid ambiguity.
 *
 * @source building-operations (lib/types.ts — Resource)
 */
export interface OpsResource {
  id: number
  resource_type: string
  description: string
  abbreviation?: string
  capacity?: number
  responsible_person?: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_event_conflicts
// ---------------------------------------------------------------------------

/**
 * A row in the ops_event_conflicts table.
 *
 * @source building-operations (lib/types.ts — EventConflict)
 */
export interface EventConflict {
  id: string
  event_a_id: string
  event_b_id: string
  conflict_type: 'time_overlap' | 'resource_conflict' | 'personnel_conflict'
  is_resolved: boolean
  resolution_notes?: string
  resolved_by?: string
  resolved_at?: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_calendar_sync
// ---------------------------------------------------------------------------

/**
 * A row in the ops_calendar_sync metadata table.
 *
 * @source building-operations (lib/types.ts — CalendarSyncMeta)
 */
export interface CalendarSyncMeta {
  calendar_id: string
  calendar_name: string
  last_sync: string
  next_sync_token?: string
  error_count: number
  last_error?: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_event_attachments
// ---------------------------------------------------------------------------

/**
 * A row in the ops_event_attachments table.
 *
 * @source building-operations (lib/types.ts — EventAttachment)
 */
export interface EventAttachment {
  id: string
  event_id: string
  storage_path: string
  file_name: string
  content_type?: string
  size_bytes?: number
  description?: string
  uploaded_by?: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Building Operations — ops_audit_log
// ---------------------------------------------------------------------------

/** @source building-operations (lib/types.ts — AuditEntityType) */
export type AuditEntityType =
  | 'ops_events'
  | 'ops_raw_events'
  | 'ops_users'
  | 'ops_event_filters'
  | 'ops_event_matches'
  | 'ops_resources'
  | 'event_subscriptions'

/** @source building-operations (lib/types.ts — AuditAction) */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_UPDATE'

/**
 * A row in the ops_audit_log table.
 *
 * @source building-operations (lib/types.ts — AuditLogEntry)
 */
export interface OpsAuditLogEntry {
  id: string
  entity_type: AuditEntityType
  entity_id: string
  action: AuditAction
  user_email?: string
  changed_fields?: Record<string, { old: unknown; new: unknown }>
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  api_route?: string
  http_method?: string
  metadata?: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Attendance — attendance_ytd
// ---------------------------------------------------------------------------

/**
 * A row in the attendance_ytd table (synced from BigQuery).
 *
 * @source attendance-portal (lib/types.ts — AttendanceRecord)
 */
export interface AttendanceRecord {
  id: number
  student_id: number
  student_full: string
  status: 'Absent - Unexcused' | 'Absent - Excused' | 'Tardy - Unexcused' | 'Tardy - Excused'
  school_year: string
  record_count: number
  division: string | null
  grade: string | null
  parent_1_full: string | null
  parent_2_full: string | null
  parent_1_first: string | null
  parent_2_first: string | null
  updated_at: string
}
