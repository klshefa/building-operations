import { createClient } from '@supabase/supabase-js'
import type { AuditEntityType, AuditAction } from './types'

// Admin client for audit logging (bypasses RLS)
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface AuditLogParams {
  entityType: AuditEntityType
  entityId: string
  action: AuditAction
  userEmail?: string
  changedFields?: Record<string, { old: unknown; new: unknown }>
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  apiRoute?: string
  httpMethod?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an audit event to the ops_audit_log table
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    
    const { error } = await supabase
      .from('ops_audit_log')
      .insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        user_email: params.userEmail,
        changed_fields: params.changedFields,
        old_values: params.oldValues,
        new_values: params.newValues,
        api_route: params.apiRoute,
        http_method: params.httpMethod,
        metadata: params.metadata,
      })
    
    if (error) {
      console.error('Failed to write audit log:', error)
    }
  } catch (err) {
    // Don't let audit failures break the main operation
    console.error('Audit logging error:', err)
  }
}

/**
 * Calculate which fields changed between old and new values
 */
export function getChangedFields(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  
  // Check all keys in newValues
  for (const key of Object.keys(newValues)) {
    const oldVal = oldValues[key]
    const newVal = newValues[key]
    
    // Skip if both are undefined/null
    if (oldVal == null && newVal == null) continue
    
    // Check if values are different
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { old: oldVal, new: newVal }
    }
  }
  
  // Check for deleted keys (in old but not in new)
  for (const key of Object.keys(oldValues)) {
    if (!(key in newValues) && oldValues[key] != null) {
      changes[key] = { old: oldValues[key], new: undefined }
    }
  }
  
  return Object.keys(changes).length > 0 ? changes : undefined
}

/**
 * Helper to extract relevant fields from an event for audit logging
 */
export function extractEventAuditFields(event: Record<string, unknown>): Record<string, unknown> {
  const auditFields = [
    'title', 'description', 'start_date', 'end_date', 'start_time', 'end_time',
    'all_day', 'location', 'resource_id', 'event_type',
    'expected_attendees', 'food_served', 'food_provider',
    'needs_program_director', 'needs_office', 'needs_it', 'needs_security', 'needs_facilities',
    'program_director_notes', 'office_notes', 'it_notes', 'security_notes', 'facilities_notes',
    'setup_instructions', 'security_personnel_needed', 'building_open', 'elevator_notes',
    'techs_needed', 'av_equipment', 'tech_notes', 'general_notes',
    'is_hidden', 'has_conflict', 'conflict_ok', 'conflict_notes'
  ]
  
  const result: Record<string, unknown> = {}
  for (const field of auditFields) {
    if (field in event) {
      result[field] = event[field]
    }
  }
  return result
}

/**
 * Helper to extract relevant fields from a user for audit logging
 */
export function extractUserAuditFields(user: Record<string, unknown>): Record<string, unknown> {
  const auditFields = ['email', 'name', 'role', 'teams', 'is_active']
  
  const result: Record<string, unknown> = {}
  for (const field of auditFields) {
    if (field in user) {
      result[field] = user[field]
    }
  }
  return result
}

/**
 * Helper to extract relevant fields from a filter for audit logging
 */
export function extractFilterAuditFields(filter: Record<string, unknown>): Record<string, unknown> {
  const auditFields = ['name', 'filter_type', 'filter_value', 'case_sensitive', 'is_active']
  
  const result: Record<string, unknown> = {}
  for (const field of auditFields) {
    if (field in filter) {
      result[field] = filter[field]
    }
  }
  return result
}
