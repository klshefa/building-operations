/**
 * Cross-portal shared types for the Shefa platform.
 *
 * These types are used identically (or near-identically) across three or more
 * portal applications. They are the highest-priority extraction targets.
 */

// ---------------------------------------------------------------------------
// Audit Events
// ---------------------------------------------------------------------------

/**
 * Parameters for logging a platform audit event.
 *
 * @source sharks-portal, attendance-portal, dismissal-app, firedrill-portal,
 *         outplacement-tracker, enrollment-tracker, building-operations
 *         (lib/audit-events.ts in each)
 */
export interface AuditEventParams {
  event_type: 'login' | 'logout' | 'data_change' | 'access' | 'api_call' | 'system'
  event_category: 'auth' | 'data' | 'access' | 'system'
  portal: string
  action?: string
  user_id?: string | null
  user_email?: string | null
  user_name?: string | null
  ip_address?: string | null
  user_agent?: string | null
  source_url?: string | null
  target_url?: string | null
  metadata?: Record<string, any>
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

/**
 * Severity levels for system monitoring events.
 *
 * @source sharks-portal, dismissal-app, enrollment-tracker,
 *         outplacement-tracker, attendance-portal (lib/monitoring.ts in each)
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low'

/**
 * Event types for the system monitoring / health-check pipeline.
 *
 * Named MonitoringEventType to avoid collision with portal-specific
 * EventType unions (e.g. Building Operations event types).
 *
 * @source sharks-portal, dismissal-app, enrollment-tracker,
 *         outplacement-tracker, attendance-portal (lib/monitoring.ts in each)
 */
export type MonitoringEventType =
  | 'error'
  | 'warning'
  | 'info'
  | 'sync'
  | 'health_check'
  | 'uptime'
  | 'performance'

/**
 * Alias for MonitoringEventType matching the name used by all portals locally.
 *
 * Portals universally define this as `EventType`; the longer canonical name
 * `MonitoringEventType` exists to avoid ambiguity with the unrelated
 * `OpsEventType` (building-operations event categories) in this package.
 * Either name may be imported.
 */
export type EventType = MonitoringEventType

/**
 * Options passed to SystemMonitor.logEvent().
 *
 * @source sharks-portal, dismissal-app, enrollment-tracker,
 *         outplacement-tracker, attendance-portal (lib/monitoring.ts in each)
 */
export interface LogEventOptions {
  eventType?: MonitoringEventType
  severity?: Severity
  message?: string
  metadata?: Record<string, unknown>
  sourceUrl?: string
  userEmail?: string
}

// ---------------------------------------------------------------------------
// Sync Pipeline
// ---------------------------------------------------------------------------

/**
 * Result returned by any data-sync operation (BigQuery, Veracross, etc.).
 *
 * Canonical definition includes 'timeout' status from enrollment-tracker;
 * all other portals use a subset ('success' | 'failed' | 'partial').
 *
 * @source attendance-portal, building-operations, enrollment-tracker,
 *         after_school_manager, event-tracker (lib/sync-monitor.ts in each)
 */
export interface SyncResult {
  status: 'success' | 'failed' | 'partial' | 'timeout'
  records_processed?: number
  records_created?: number
  records_updated?: number
  records_failed?: number
  error_message?: string
  error_details?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

/**
 * Visual variant for toast notifications.
 *
 * @source sharks-portal, attendance-portal, dismissal-app,
 *         enrollment-tracker, firedrill-portal, outplacement-tracker
 *         (components/ui/Toast.tsx in each)
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info'

/**
 * A single toast notification message.
 *
 * @source sharks-portal, attendance-portal, dismissal-app,
 *         enrollment-tracker, firedrill-portal, outplacement-tracker
 *         (components/ui/Toast.tsx in each)
 */
export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}
