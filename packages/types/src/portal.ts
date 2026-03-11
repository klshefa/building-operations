/**
 * Portal-specific domain types.
 *
 * These types belong to a single portal's domain model but are important
 * enough to centralize. They are not direct table row mappings (those live
 * in database.ts) but rather computed, aggregated, or API-layer types.
 */

// ---------------------------------------------------------------------------
// Building Operations — Notifications
// ---------------------------------------------------------------------------

/**
 * A recipient of an email notification.
 *
 * @source building-operations (lib/notifications.ts — NotificationRecipient)
 */
export interface NotificationRecipient {
  email: string
  name?: string
}

/**
 * Options for sending a single email via the notification system.
 *
 * @source building-operations (lib/notifications.ts — SendEmailOptions)
 */
export interface SendEmailOptions {
  to: NotificationRecipient[]
  subject: string
  html: string
}

/**
 * Lightweight event summary used in weekly digest emails.
 *
 * @source building-operations (lib/notifications.ts — DigestEvent)
 */
export interface DigestEvent {
  id: string
  title: string
  start_date: string
  start_time?: string
  end_time?: string
  location?: string
  teams: string[]
}

// ---------------------------------------------------------------------------
// Building Operations — Auth
// ---------------------------------------------------------------------------

/**
 * Result of verifying API authentication for Building Operations routes.
 *
 * @source building-operations (lib/api-auth.ts — AuthResult)
 */
export interface OpsAuthResult {
  user: { email: string; id: string }
  role: string
  teams: string[]
  isAdmin: boolean
}

// ---------------------------------------------------------------------------
// Attendance — Domain Types
// ---------------------------------------------------------------------------

/**
 * Intervention type string literal.
 *
 * @source attendance-portal (lib/types.ts — InterventionType)
 */
export type InterventionType = 'letter' | 'division_call' | 'head_call' | 'meeting'

/**
 * User roles in the Attendance portal.
 *
 * Named AttendanceUserRole to avoid collision with OpsUserRole.
 *
 * @source attendance-portal (lib/types.ts — UserRole)
 */
export type AttendanceUserRole = 'admin' | 'head_of_school' | 'division_head_ls' | 'division_head_ms' | 'viewer'

/**
 * Pending intervention with stage context and threshold proof.
 *
 * @source attendance-portal (lib/types.ts — PendingIntervention)
 */
export interface PendingIntervention {
  type: InterventionType
  stage: number
  isOverdue: boolean
  ua_threshold: number | null
  ta_threshold: number | null
  triggered_by: 'ua' | 'ta' | 'both'
}

/**
 * Aggregated student attendance summary (computed from attendance_ytd rows).
 *
 * @source attendance-portal (lib/types.ts — StudentAttendance)
 */
export interface StudentAttendance {
  student_id: number
  student_full: string
  division: string | null
  grade: string | null
  parent_1_full: string | null
  parent_2_full: string | null
  parent_1_first: string | null
  parent_2_first: string | null
  school_year: string
  unexcused_absences: number
  excused_absences: number
  total_absences: number
  unexcused_tardies: number
  excused_tardies: number
  total_tardies: number
  has_override: boolean
  override_reason?: string
  override_created_at?: string
  override_created_by?: string
  current_intervention: InterventionType | null
  pending_intervention: PendingIntervention | null
  all_pending_interventions: PendingIntervention[]
  interventions_sent: string[]
  interventions_by_stage: Record<number, string[]>
}

/**
 * Stage configuration for the attendance intervention pipeline.
 *
 * @source attendance-portal (lib/types.ts — Stage)
 */
export interface Stage {
  id: number
  school_year: string
  stage: number
  deadline: string
  created_at: string
}

/**
 * Intervention threshold configuration per stage.
 *
 * @source attendance-portal (lib/types.ts — Threshold)
 */
export interface Threshold {
  id: number
  school_year: string
  stage: number
  intervention_type: InterventionType
  ua_threshold: number | null
  ta_threshold: number | null
  action_notes: string | null
  created_at: string
}

/**
 * Intervention history record.
 *
 * @source attendance-portal (lib/types.ts — Intervention)
 */
export interface Intervention {
  id: number
  student_id: number
  school_year: string
  stage: number
  intervention_type: InterventionType
  triggered_at: string
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  email_sent: boolean
  email_sent_at: string | null
}

/**
 * Admin override for a student's intervention pipeline.
 *
 * @source attendance-portal (lib/types.ts — Override)
 */
export interface Override {
  id: number
  student_id: number
  school_year: string
  reason: string | null
  created_by: string
  created_at: string
  expires_at: string | null
}

/**
 * Portal user in the Attendance system.
 *
 * Renamed from PortalUser to AttendancePortalUser for clarity.
 *
 * @source attendance-portal (lib/types.ts — PortalUser)
 */
export interface AttendancePortalUser {
  id: number
  email: string
  role: AttendanceUserRole
  name: string | null
  created_at: string
}

/**
 * Division head configuration.
 *
 * @source attendance-portal (lib/types.ts — DivisionHead)
 */
export interface DivisionHead {
  id: number
  division: 'Lower School' | 'Middle School'
  head_email: string
  head_name: string | null
  school_year: string
}

/**
 * Student at risk of triggering an intervention soon.
 *
 * @source attendance-portal (lib/types.ts — AtRiskStudent)
 */
export interface AtRiskStudent {
  student_id: number
  student_full: string
  division: string | null
  grade: string | null
  unexcused_absences: number
  total_absences: number
  nextIntervention: InterventionType
  nextStage: number
  ua_threshold: number | null
  ta_threshold: number | null
  ua_away: number | null
  ta_away: number | null
  risk_level: 'high' | 'medium'
}

/**
 * Dashboard statistics for the Attendance portal.
 *
 * Renamed from DashboardStats to AttendanceDashboardStats for clarity.
 *
 * @source attendance-portal (lib/types.ts — DashboardStats)
 */
export interface AttendanceDashboardStats {
  currentStage: number
  currentDeadline: string
  daysRemaining: number
  totalStudents: number
  studentsNeedingLetter: number
  studentsNeedingDivisionCall: number
  studentsNeedingHeadCall: number
  studentsNeedingMeeting: number
  overdueLetters: number
  overdueDivisionCalls: number
  overdueHeadCalls: number
  overdueMeetings: number
  overridesActive: number
  lsByIntervention: Record<InterventionType, number>
  msByIntervention: Record<InterventionType, number>
  atRiskStudents: AtRiskStudent[]
}

/**
 * Email template for intervention communications.
 *
 * @source attendance-portal (lib/types.ts — EmailTemplate)
 */
export interface EmailTemplate {
  type: InterventionType
  subject: string
  body: string
}

/**
 * Email queue item for intervention communications.
 *
 * @source attendance-portal (lib/types.ts — EmailQueueItem)
 */
export interface EmailQueueItem {
  id: number
  student_id: number
  student_full: string
  division: string
  intervention_type: InterventionType
  recipient_email: string
  recipient_name: string
  subject: string
  body: string
  status: 'pending' | 'sent' | 'failed'
  created_at: string
  sent_at: string | null
}

// ---------------------------------------------------------------------------
// Fire Drill — Domain Types
// ---------------------------------------------------------------------------

/**
 * A person (student or staff) tracked during a fire drill.
 *
 * @source firedrill-portal (lib/hooks/useFireDrill.ts — Person)
 */
export interface FireDrillPerson {
  person_id: number
  first_name: string
  last_name: string
  full_name: string
  person_type: 'student' | 'staff'
  class_name: string | null
  grade_level?: number | null
  checked_in: boolean
  out_today: boolean
  checked_in_at: string | null
  checked_in_by: string | null
  vc_absent: boolean
}

/**
 * Aggregate statistics for a fire drill.
 *
 * @source firedrill-portal (lib/hooks/useFireDrill.ts — DrillStats)
 */
export interface DrillStats {
  totalStaff: number
  staffCheckedIn: number
  staffOut: number
  staffVcAbsent: number
  totalStudents: number
  studentsCheckedIn: number
  studentsOut: number
  studentsVcAbsent: number
  overallPercent: number
}
