import { NextResponse } from 'next/server'
import { format, parseISO, eachDayOfInterval, isAfter, getDay } from 'date-fns'

// Map day abbreviations to day numbers (0=Sun, 1=Mon, etc)
const dayMap: Record<string, number> = {
  'U': 0, 'Su': 0, 'SU': 0, 'Sun': 0,
  'M': 1, 'Mo': 1, 'MO': 1, 'Mon': 1,
  'T': 2, 'Tu': 2, 'TU': 2, 'Tue': 2,
  'W': 3, 'We': 3, 'WE': 3, 'Wed': 3,
  'R': 4, 'Th': 4, 'TH': 4, 'Thu': 4,
  'F': 5, 'Fr': 5, 'FR': 5, 'Fri': 5,
  'S': 6, 'Sa': 6, 'SA': 6, 'Sat': 6,
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start') || '2026-02-16'
  const endDate = searchParams.get('end') || '2026-02-16'
  const days = searchParams.get('days') || 'M'
  
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const today = new Date()
  const maxEndDate = parseISO('2026-07-31')
  
  const effectiveEnd = isAfter(end, maxEndDate) ? maxEndDate : end
  
  const activeDays = days.split(',').map(d => dayMap[d.trim()]).filter(d => d !== undefined)
  
  const allDays = eachDayOfInterval({ start, end: effectiveEnd })
  
  const filteredDays = allDays.filter(day => {
    const dayOfWeek = getDay(day)
    return activeDays.includes(dayOfWeek) && (isAfter(day, today) || format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'))
  })
  
  return NextResponse.json({
    input: { startDate, endDate, days },
    parsed: {
      start: format(start, 'yyyy-MM-dd EEEE'),
      end: format(end, 'yyyy-MM-dd EEEE'),
      effectiveEnd: format(effectiveEnd, 'yyyy-MM-dd'),
      today: format(today, 'yyyy-MM-dd'),
      activeDays,
      dayOfWeek_start: getDay(start)
    },
    allDaysInInterval: allDays.map(d => ({ date: format(d, 'yyyy-MM-dd'), day: format(d, 'EEEE'), dayNum: getDay(d) })),
    filteredDays: filteredDays.map(d => format(d, 'yyyy-MM-dd EEEE'))
  })
}
