export function formatTimeDisplay(timeStr?: string | null): string {
  if (!timeStr) return ''

  const raw = String(timeStr).trim()
  if (!raw) return ''

  // If already includes am/pm, keep as-is (just normalize whitespace).
  if (/\b(am|pm)\b/i.test(raw)) {
    return raw.replace(/\s+/g, ' ').trim()
  }

  // ISO-like: "...T08:10:00Z" (or any string containing T08:10)
  const iso = raw.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    const hours = parseInt(iso[1], 10)
    const minutes = parseInt(iso[2], 10)
    return formatHhMm(hours, minutes)
  }

  // HH:MM or HH:MM:SS
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (hhmm) {
    const hours = parseInt(hhmm[1], 10)
    const minutes = parseInt(hhmm[2], 10)
    return formatHhMm(hours, minutes)
  }

  return raw
}

function formatHhMm(hours: number, minutes: number): string {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''
  const h = ((hours % 24) + 24) % 24
  const m = ((minutes % 60) + 60) % 60

  const ampm = h >= 12 ? 'pm' : 'am'
  const displayHour = h % 12 || 12

  if (m === 0) return `${displayHour}${ampm}`
  return `${displayHour}:${String(m).padStart(2, '0')}${ampm}`
}

