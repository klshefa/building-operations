'use client'

import { useState, useEffect, useCallback } from 'react'
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

interface Conflict {
  type: 'conflict' | 'warning'
  title: string
  startTime: string
  endTime: string
  message: string
}

interface AvailabilityResult {
  available: boolean
  conflicts: Conflict[]
  warnings: Conflict[]
  error?: string
}

interface AvailabilityCheckProps {
  resourceId?: number  // Preferred: use resource ID directly
  resourceName: string // Used for display and fallback lookup
  date: string
  startTime: string
  endTime: string
  excludeEventId?: string
  excludeEventName?: string
  className?: string
}

export function AvailabilityCheck({
  resourceId,
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
  const [resolvedResourceId, setResolvedResourceId] = useState<number | null>(resourceId || null)

  // Resolve resource ID from name if not provided
  useEffect(() => {
    if (resourceId) {
      setResolvedResourceId(resourceId)
      return
    }
    
    if (!resourceName) {
      setResolvedResourceId(null)
      return
    }

    // Look up resource by name
    async function lookupResource() {
      try {
        const res = await fetch('/api/resources')
        if (res.ok) {
          const { data } = await res.json()
          const match = data?.find((r: any) => 
            r.description?.toLowerCase() === resourceName.toLowerCase() ||
            r.abbreviation?.toLowerCase() === resourceName.toLowerCase()
          )
          if (match) {
            setResolvedResourceId(match.id)
          }
        }
      } catch (err) {
        console.error('Error looking up resource:', err)
      }
    }
    lookupResource()
  }, [resourceId, resourceName])

  const checkAvailability = useCallback(async () => {
    if (!resolvedResourceId || !date || !startTime || !endTime) {
      setResult(null)
      return
    }

    const checkKey = `${resolvedResourceId}|${date}|${startTime}|${endTime}|${excludeEventId}|${excludeEventName}`
    if (checkKey === lastChecked) return

    setChecking(true)
    setLastChecked(checkKey)

    try {
      // Use the comprehensive availability check API
      let url = `/api/availability/check?resourceId=${resolvedResourceId}&date=${date}&startTime=${startTime}&endTime=${endTime}`
      if (excludeEventId) url += `&excludeEventId=${encodeURIComponent(excludeEventId)}`
      if (excludeEventName) url += `&excludeEventName=${encodeURIComponent(excludeEventName)}`
      const response = await fetch(url)
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error('Availability check failed:', error)
      setResult(null)
    } finally {
      setChecking(false)
    }
  }, [resolvedResourceId, date, startTime, endTime, excludeEventId, excludeEventName, lastChecked])

  useEffect(() => {
    const timer = setTimeout(() => {
      checkAvailability()
    }, 500)
    return () => clearTimeout(timer)
  }, [resolvedResourceId, date, startTime, endTime])

  if (!resourceName || !date) {
    return null
  }

  if (checking) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        <span>Checking availability...</span>
      </div>
    )
  }

  if (result?.error) {
    return (
      <div className={`text-sm text-red-600 ${className}`}>
        Error: {result.error}
      </div>
    )
  }

  if (!result) {
    return null
  }

  if (result.available && result.conflicts.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircleIcon className="w-4 h-4" />
          <span>Available</span>
        </div>
        {result.warnings && result.warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {result.warnings.slice(0, 3).map((w, i) => (
              <div key={i} className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                {w.message}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

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
            <div className="font-medium text-slate-700">{conflict.title}</div>
            <div className="text-slate-500 mt-0.5">
              {conflict.startTime && conflict.endTime 
                ? `${conflict.startTime} - ${conflict.endTime}`
                : conflict.message}
            </div>
          </div>
        ))}
        {result.conflicts.length > 5 && (
          <div className="text-xs text-slate-500 italic">
            +{result.conflicts.length - 5} more conflicts
          </div>
        )}
      </div>
      
      {result.warnings && result.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {result.warnings.slice(0, 2).map((w, i) => (
            <div key={i} className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
