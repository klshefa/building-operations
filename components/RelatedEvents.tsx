'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  LinkIcon, 
  XMarkIcon, 
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline'

interface RawEvent {
  id: string
  source: string
  source_id: string
  title: string
  description?: string
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  location?: string
  resource?: string
  match_type?: 'auto' | 'manual'
  match_confidence?: number
  matched_at?: string
  matched_by?: string
}

interface Suggestion {
  event: RawEvent
  confidence: number
  reasons: string[]
}

interface RelatedEventsProps {
  eventId: string
  userEmail?: string
  className?: string
}

// Format source name for display
function formatSource(source: string): string {
  const sourceMap: Record<string, string> = {
    'bigquery_group': 'VC Event',
    'bigquery_resource': 'VC Resource',
    'calendar_staff': 'Staff Cal',
    'calendar_ls': 'LS Cal',
    'calendar_ms': 'MS Cal',
    'manual': 'Manual'
  }
  return sourceMap[source] || source
}

// Get source badge color
function getSourceColor(source: string): string {
  const colorMap: Record<string, string> = {
    'bigquery_group': 'bg-purple-100 text-purple-700',
    'bigquery_resource': 'bg-blue-100 text-blue-700',
    'calendar_staff': 'bg-green-100 text-green-700',
    'calendar_ls': 'bg-orange-100 text-orange-700',
    'calendar_ms': 'bg-teal-100 text-teal-700',
    'manual': 'bg-slate-100 text-slate-700'
  }
  return colorMap[source] || 'bg-slate-100 text-slate-700'
}

// Format time for display
function formatTime(time: string | undefined): string {
  if (!time) return ''
  
  // Handle ISO format
  const iso = time.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    const hours = parseInt(iso[1])
    const minutes = iso[2]
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes}${period}`
  }
  
  // Handle HH:MM format
  const hhmm = time.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    const hours = parseInt(hhmm[1])
    const minutes = hhmm[2]
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes}${period}`
  }
  
  return time
}

export function RelatedEvents({ eventId, userEmail, className = '' }: RelatedEventsProps) {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState<RawEvent[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [expanded, setExpanded] = useState(true)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  // Search state for modal
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RawEvent[]>([])
  const [searching, setSearching] = useState(false)
  const [searchDate, setSearchDate] = useState('')
  
  const fetchMatches = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/events/${eventId}/matches`)
      const data = await response.json()
      
      if (data.linked) setLinked(data.linked)
      if (data.suggestions) setSuggestions(data.suggestions)
    } catch (error) {
      console.error('Error fetching matches:', error)
    } finally {
      setLoading(false)
    }
  }, [eventId])
  
  useEffect(() => {
    fetchMatches()
  }, [fetchMatches])
  
  const handleLink = async (rawEventId: string) => {
    setActionLoading(rawEventId)
    try {
      const response = await fetch(`/api/events/${eventId}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          raw_event_id: rawEventId,
          matched_by: userEmail || 'unknown'
        })
      })
      
      if (response.ok) {
        await fetchMatches()
        // Also remove from search results if present
        setSearchResults(prev => prev.filter(r => r.id !== rawEventId))
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to link event')
      }
    } catch (error) {
      console.error('Error linking event:', error)
      alert('Failed to link event')
    } finally {
      setActionLoading(null)
    }
  }
  
  const handleUnlink = async (rawEventId: string) => {
    if (!confirm('Are you sure you want to unlink this event?')) return
    
    setActionLoading(rawEventId)
    try {
      const response = await fetch(`/api/events/${eventId}/matches/${rawEventId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        await fetchMatches()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to unlink event')
      }
    } catch (error) {
      console.error('Error unlinking event:', error)
      alert('Failed to unlink event')
    } finally {
      setActionLoading(null)
    }
  }
  
  const handleDismissSuggestion = (rawEventId: string) => {
    setSuggestions(prev => prev.filter(s => s.event.id !== rawEventId))
  }
  
  const handleSearch = async () => {
    if (!searchQuery && !searchDate) return
    
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      if (searchDate) params.set('date', searchDate)
      params.set('exclude_event_id', eventId)
      
      const response = await fetch(`/api/events/search-raw?${params}`)
      const data = await response.json()
      
      if (data.results) {
        // Filter out already linked events
        const linkedIds = new Set(linked.map(l => l.id))
        setSearchResults(data.results.filter((r: RawEvent) => !linkedIds.has(r.id)))
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setSearching(false)
    }
  }
  
  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-slate-500">
          <ArrowPathIcon className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading related events...</span>
        </div>
      </div>
    )
  }
  
  const hasContent = linked.length > 0 || suggestions.length > 0
  
  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 rounded-t-xl"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Related Events</h3>
          {linked.length > 0 && (
            <span className="text-xs bg-shefa-blue-100 text-shefa-blue-700 px-2 py-0.5 rounded-full">
              {linked.length} linked
            </span>
          )}
          {suggestions.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowLinkModal(true)
            }}
            className="text-xs bg-shefa-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-shefa-blue-600 flex items-center gap-1"
          >
            <LinkIcon className="w-3 h-3" />
            Link Event
          </button>
          {expanded ? (
            <ChevronUpIcon className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>
      
      {/* Content */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* Linked Events */}
          {linked.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Linked Events ({linked.length})
              </h4>
              <div className="space-y-2">
                {linked.map((event) => (
                  <div 
                    key={event.id}
                    className="flex items-center justify-between bg-slate-50 rounded-lg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getSourceColor(event.source)}`}>
                          {formatSource(event.source)}
                        </span>
                        <span className="font-medium text-sm text-slate-800 truncate">
                          {event.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          event.match_type === 'auto' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-cyan-100 text-cyan-700'
                        }`}>
                          {event.match_type === 'auto' ? 'Auto' : 'Manual'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {event.start_date}
                        {event.start_time && ` ${formatTime(event.start_time)}`}
                        {event.end_time && `-${formatTime(event.end_time)}`}
                        {(event.location || event.resource) && ` • ${event.location || event.resource}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlink(event.id)}
                      disabled={actionLoading === event.id}
                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                    >
                      {actionLoading === event.id ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        'Unlink'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Possible Matches ({suggestions.length})
              </h4>
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <div 
                    key={suggestion.event.id}
                    className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getSourceColor(suggestion.event.source)}`}>
                          {formatSource(suggestion.event.source)}
                        </span>
                        <span className="font-medium text-sm text-slate-800 truncate">
                          {suggestion.event.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                          {Math.round(suggestion.confidence * 100)}% match
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {suggestion.event.start_date}
                        {suggestion.event.start_time && ` ${formatTime(suggestion.event.start_time)}`}
                        {suggestion.event.end_time && `-${formatTime(suggestion.event.end_time)}`}
                        {(suggestion.event.location || suggestion.event.resource) && ` • ${suggestion.event.location || suggestion.event.resource}`}
                      </div>
                      <div className="text-xs text-amber-600 mt-1">
                        {suggestion.reasons.join(' • ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleLink(suggestion.event.id)}
                        disabled={actionLoading === suggestion.event.id}
                        className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded disabled:opacity-50"
                      >
                        {actionLoading === suggestion.event.id ? (
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          'Link'
                        )}
                      </button>
                      <button
                        onClick={() => handleDismissSuggestion(suggestion.event.id)}
                        className="text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2 py-1 rounded"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Empty state */}
          {!hasContent && (
            <div className="text-center py-6 text-slate-500">
              <LinkIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No related events found</p>
              <p className="text-xs mt-1">Click "Link Event" to manually connect related events</p>
            </div>
          )}
        </div>
      )}
      
      {/* Link Event Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Link Related Event</h3>
              <button
                onClick={() => {
                  setShowLinkModal(false)
                  setSearchQuery('')
                  setSearchDate('')
                  setSearchResults([])
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            {/* Search Form */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by title..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                />
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || (!searchQuery && !searchDate)}
                  className="px-4 py-2 bg-shefa-blue-500 text-white rounded-lg hover:bg-shefa-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {searching ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <MagnifyingGlassIcon className="w-4 h-4" />
                  )}
                  Search
                </button>
              </div>
            </div>
            
            {/* Search Results */}
            <div className="flex-1 overflow-y-auto p-4">
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((event) => (
                    <div 
                      key={event.id}
                      className="flex items-center justify-between bg-slate-50 rounded-lg p-3 hover:bg-slate-100"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getSourceColor(event.source)}`}>
                            {formatSource(event.source)}
                          </span>
                          <span className="font-medium text-sm text-slate-800 truncate">
                            {event.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {event.start_date}
                          {event.start_time && ` ${formatTime(event.start_time)}`}
                          {event.end_time && `-${formatTime(event.end_time)}`}
                          {(event.location || event.resource) && ` • ${event.location || event.resource}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleLink(event.id)}
                        disabled={actionLoading === event.id}
                        className="text-xs bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        {actionLoading === event.id ? (
                          <ArrowPathIcon className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <LinkIcon className="w-3 h-3" />
                            Link
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : searchQuery || searchDate ? (
                <div className="text-center py-8 text-slate-500">
                  <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No results found</p>
                  <p className="text-xs mt-1">Try a different search term or date</p>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Search for events to link</p>
                  <p className="text-xs mt-1">Enter a title or select a date to find events</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
