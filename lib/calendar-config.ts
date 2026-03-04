import type { EventSource } from './types'

export interface GoogleCalendarFeed {
  slug: string
  source: EventSource
  calendarId: string
  name: string
  syncName: string
}

export const GOOGLE_CALENDARS: GoogleCalendarFeed[] = [
  {
    slug: 'calendar-staff',
    source: 'calendar_staff',
    calendarId: 'shefaschool.org_jhs622n7onu1itim84h5ch41to@group.calendar.google.com',
    name: 'Staff Calendar',
    syncName: 'calendar-staff-sync',
  },
  {
    slug: 'calendar-ls',
    source: 'calendar_ls',
    calendarId: 'c_ll3pn34b3vul3a08qrqq6vn00g@group.calendar.google.com',
    name: 'Lower School',
    syncName: 'calendar-ls-sync',
  },
  {
    slug: 'calendar-ms',
    source: 'calendar_ms',
    calendarId: 'c_vk1n1cdvov22evuq77t4cehn68@group.calendar.google.com',
    name: 'Middle School',
    syncName: 'calendar-ms-sync',
  },
  {
    slug: 'calendar-maintenance',
    source: 'calendar_maintenance',
    calendarId: 'c_f3a382bed8047ea9c4752c76b00336e7d484d88567928b7777e72c820f3cdbc8@group.calendar.google.com',
    name: 'Maintenance Setups',
    syncName: 'calendar-maintenance-sync',
  },
  {
    slug: 'calendar-admissions',
    source: 'calendar_admissions',
    calendarId: 'n7eelka44qs2fq2ke1r34e3ejk@group.calendar.google.com',
    name: 'Admissions Events',
    syncName: 'calendar-admissions-sync',
  },
]

export const ALL_CALENDAR_SOURCES: EventSource[] =
  GOOGLE_CALENDARS.map(c => c.source)

export const SOURCE_LABELS: Record<EventSource, string> = {
  bigquery_group: 'VC Event',
  bigquery_resource: 'VC Resource',
  calendar_staff: 'Staff Cal',
  calendar_ls: 'LS Cal',
  calendar_ms: 'MS Cal',
  calendar_maintenance: 'Maint',
  calendar_admissions: 'Admissions',
  manual: 'Manual',
}

export const SOURCE_COLORS: Record<EventSource, string> = {
  bigquery_group: 'bg-purple-100 text-purple-700',
  bigquery_resource: 'bg-blue-100 text-blue-700',
  calendar_staff: 'bg-green-100 text-green-700',
  calendar_ls: 'bg-orange-100 text-orange-700',
  calendar_ms: 'bg-teal-100 text-teal-700',
  calendar_maintenance: 'bg-rose-100 text-rose-700',
  calendar_admissions: 'bg-indigo-100 text-indigo-700',
  manual: 'bg-slate-100 text-slate-700',
}

/** calendar/page.tsx uses slightly different colors for visual distinction */
export const CALENDAR_VIEW_SOURCE_COLORS: Record<EventSource, string> = {
  ...SOURCE_COLORS,
  calendar_staff: 'bg-amber-100 text-amber-700',
  calendar_ls: 'bg-green-100 text-green-700',
}

export const SOURCE_PRIORITY: EventSource[] = [
  'bigquery_group',
  'calendar_staff',
  'calendar_ls',
  'calendar_ms',
  'calendar_maintenance',
  'calendar_admissions',
  'bigquery_resource',
  'manual',
]

export const SOURCE_FILTERS: { value: EventSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'bigquery_group', label: 'Group Events' },
  { value: 'bigquery_resource', label: 'Resource Reservations' },
  { value: 'calendar_staff', label: 'Staff Calendar' },
  { value: 'calendar_ls', label: 'Lower School' },
  { value: 'calendar_ms', label: 'Middle School' },
  { value: 'calendar_maintenance', label: 'Maintenance Setups' },
  { value: 'calendar_admissions', label: 'Admissions Events' },
  { value: 'manual', label: 'Manual' },
]
