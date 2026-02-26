// Event sources
export type EventSource = 'bigquery_group' | 'bigquery_resource' | 'calendar_staff' | 'calendar_ls' | 'calendar_ms' | 'manual'

// Event types
export type EventType = 
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

// Team types
export type TeamType = 'program_director' | 'office' | 'it' | 'security' | 'facilities'

// User roles
export type UserRole = 'admin' | 'program_director' | 'office' | 'it' | 'security' | 'facilities' | 'viewer'

// Raw event from sync sources before aggregation
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
  reservation_id?: string // For matching events across BigQuery sources
  recurring_pattern?: string // e.g., "T,R" for Tuesday/Thursday
  raw_data: Record<string, unknown>
  synced_at: string
}

// Aggregated event (main table)
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
  event_type: EventType
  
  // General info
  expected_attendees?: number
  food_served: boolean
  food_provider?: string
  
  // Team assignments
  needs_program_director: boolean
  needs_office: boolean
  needs_it: boolean
  needs_security: boolean
  needs_facilities: boolean
  
  // Team notes
  program_director_notes?: string
  office_notes?: string
  it_notes?: string
  security_notes?: string
  facilities_notes?: string
  
  // Facilities details
  setup_instructions?: string
  
  // Security details
  security_personnel_needed?: number
  building_open: boolean
  elevator_notes?: string
  
  // IT details
  techs_needed?: number
  assigned_techs?: string[]
  av_equipment?: string
  tech_notes?: string
  
  // General notes
  general_notes?: string
  
  // Status
  is_hidden: boolean
  has_conflict: boolean
  conflict_ok: boolean
  conflict_notes?: string
  status: 'active' | 'cancelled'
  
  // Self-service request tracking
  requested_by?: string  // Email of requester
  requested_at?: string  // When requested
  veracross_reservation_id?: string  // Reservation ID from Veracross API
  
  // Source tracking
  source_events: string[] // Array of raw_event IDs that matched to this event
  primary_source: EventSource
  sources: EventSource[] // All sources this event appears in
  
  // Metadata
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

// Resource from BigQuery
export interface Resource {
  id: number
  resource_type: string
  description: string
  abbreviation?: string
  capacity?: number
  responsible_person?: string
}

// User
export interface OpsUser {
  id: string
  email: string
  name?: string
  role: UserRole
  teams: TeamType[] // Which teams they belong to
  is_active: boolean
  digest_enabled?: boolean // Whether user receives weekly digest email (default true)
  notify_on_team_assignment?: boolean
  notify_on_subscribed_changes?: boolean
  notify_on_new_event?: boolean
  created_at: string
}

// Conflict
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

// Calendar sync metadata
export interface CalendarSyncMeta {
  calendar_id: string
  calendar_name: string
  last_sync: string
  next_sync_token?: string
  error_count: number
  last_error?: string
}

// Audit log entry
export type AuditEntityType = 
  | 'ops_events'
  | 'ops_raw_events'
  | 'ops_users'
  | 'ops_event_filters'
  | 'ops_event_matches'
  | 'ops_resources'
  | 'event_subscriptions'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_UPDATE'

export interface AuditLogEntry {
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
