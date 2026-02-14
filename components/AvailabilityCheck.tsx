'use client'

import { useState, useEffect, useCallback } from 'react'
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

interface ConflictInfo {
  type: 'definite' | 'possible'
  source: 'class_schedule' | 'reservation'
  description: string
  resource_name?: string
  start_time?: string
  end_time?: string
  days_pattern?: string
}

interface AvailabilityResult {
  available: boolean
  conflicts: ConflictInfo[]
  possible_conflicts: ConflictInfo[]
  debug?: {
    class_schedules_checked: number
    reservations_checked: number
  }
  error?: string
}

interface AvailabilityCheckProps {
  resourceName: string
  date: string
  startTime: string
  endTime: string
  excludeEventId?: string  // When editing an event, exclude it from conflict results
  excludeEventName?: string // Fallback: exclude by matching name
  className?: string
}

export function AvailabilityCheck({
  resourceName,
  date,
  startTime,
  endTime,
  excludeEventId,
  excludeEventName,
  className = '',
}: AvailabilityCheckProps) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<AvailabilityResult | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('')

  const checkAvailability = useCallback(async () => {
    // Don't check if we don't have the required fields
    if (!resourceName || !date || !startTime || !endTime) {
      setResult(null)
      return
    }

    // Create a key to avoid duplicate checks
    const checkKey = `${resourceName}|${date}|${startTime}|${endTime}|${excludeEventId}`
    if (checkKey === lastChecked) return

    setChecking(true)
    setLastChecked(checkKey)

    try {
      const response = await fetch('/api/veracross/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name: resourceName,
          date,
          start_time: startTime,
          end_time: endTime,
          exclude_event_id: excludeEventId,
          exclude_event_name: excludeEventName,
        }),
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error('Availability check failed:', error)
      setResult(null)
    } finally {
      setChecking(false)
    }
  }, [resourceName, date, startTime, endTime, excludeEventId, excludeEventName, lastChecked])

  // Debounced check when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      checkAvailability()
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [resourceName, date, startTime, endTime])

  // Don't render anything if we don't have enough info
  if (!resourceName || !date) {
    return null
  }

  // Show loading state
  if (checking) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        <span>Checking availability...</span>
      </div>
    )
  }

  // Show error
  if (result?.error) {
    return (
      <div className={`text-sm text-red-600 ${className}`}>
        Error checking availability: {result.error}
      </div>
    )
  }

  // No result yet
  if (!result) {
    return null
  }

  // Show results
  if (result.available && result.conflicts.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-green-600 ${className}`}>
        <CheckCircleIcon className="w-4 h-4" />
        <span>Available</span>
      </div>
    )
  }

  // Show conflicts
  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 text-sm text-red-600 mb-2">
        <ExclamationTriangleIcon className="w-4 h-4" />
        <span className="font-medium">
          {result.conflicts.length} conflict{result.conflicts.length !== 1 ? 's' : ''} found
        </span>
      </div>
      
      <div className="space-y-1.5 max-h-32 overflow-y-auto">
        {result.conflicts.slice(0, 5).map((conflict, i) => (
          <div 
            key={i} 
            className="text-xs bg-red-50 border border-red-100 rounded px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">{conflict.description}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                conflict.source === 'class_schedule' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {conflict.source === 'class_schedule' ? 'Class' : 'Reservation'}
              </span>
            </div>
            <div className="text-slate-500 mt-0.5">
              {conflict.start_time} - {conflict.end_time}
              {conflict.days_pattern && ` (${conflict.days_pattern})`}
            </div>
          </div>
        ))}
        {result.conflicts.length > 5 && (
          <div className="text-xs text-slate-500 italic">
            +{result.conflicts.length - 5} more conflicts
          </div>
        )}
      </div>
    </div>
  )
}
