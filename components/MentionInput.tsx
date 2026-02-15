'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AtSymbolIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface StaffMember {
  person_id: number
  first_name: string
  last_name: string
  email: string
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
  label?: string
  onMentionsChange?: (emails: string[]) => void
}

/**
 * A textarea that supports @mentions with autocomplete
 * When user types @, shows a dropdown of staff members to mention
 */
export function MentionInput({
  value,
  onChange,
  placeholder = 'Type @ to mention someone...',
  rows = 3,
  disabled = false,
  className = '',
  label,
  onMentionsChange,
}: MentionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Extract current mentions from text
  const extractMentions = useCallback((text: string): string[] => {
    if (!text) return []
    // Match @[Name](email) format
    const pattern = /@\[([^\]]+)\]\(([^)]+)\)/g
    const mentions: string[] = []
    let match
    while ((match = pattern.exec(text)) !== null) {
      mentions.push(match[2]) // email is in group 2
    }
    return [...new Set(mentions)]
  }, [])

  // Notify parent of mention changes
  useEffect(() => {
    if (onMentionsChange) {
      const mentions = extractMentions(value)
      onMentionsChange(mentions)
    }
  }, [value, extractMentions, onMentionsChange])

  // Search staff when query changes
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const fetchStaff = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/staff/search?q=${encodeURIComponent(searchQuery)}`)
        const { data } = await res.json()
        setSearchResults(data || [])
        setSelectedIndex(0)
      } catch (err) {
        console.error('Staff search error:', err)
        setSearchResults([])
      }
      setLoading(false)
    }

    const debounce = setTimeout(fetchStaff, 200)
    return () => clearTimeout(debounce)
  }, [searchQuery])

  // Handle text input
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0
    
    onChange(newValue)

    // Check if we're in a mention context (after @)
    const textBeforeCursor = newValue.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      // Only show dropdown if there's no space or special chars after @
      if (!/[\s\n\[\]]/.test(textAfterAt)) {
        setMentionStartPos(lastAtIndex)
        setSearchQuery(textAfterAt)
        setShowDropdown(true)
        return
      }
    }
    
    setShowDropdown(false)
    setSearchQuery('')
    setMentionStartPos(null)
  }

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || searchResults.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
      case 'Tab':
        if (searchResults[selectedIndex]) {
          e.preventDefault()
          insertMention(searchResults[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowDropdown(false)
        break
    }
  }

  // Insert a mention at the current cursor position
  const insertMention = (staff: StaffMember) => {
    if (mentionStartPos === null || !textareaRef.current) return

    const displayName = `${staff.first_name} ${staff.last_name}`
    const mentionText = `@[${displayName}](${staff.email})`
    
    // Replace the @query with the mention
    const beforeMention = value.slice(0, mentionStartPos)
    const afterMention = value.slice(textareaRef.current.selectionStart || mentionStartPos + searchQuery.length + 1)
    
    const newValue = beforeMention + mentionText + ' ' + afterMention
    onChange(newValue)

    // Reset state
    setShowDropdown(false)
    setSearchQuery('')
    setMentionStartPos(null)
    setSearchResults([])

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length + 1
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Render mention text with highlighting
  const renderMentionPreview = (text: string) => {
    if (!text) return null
    
    // Replace @[Name](email) with styled spans
    const parts = text.split(/(@\[[^\]]+\]\([^)]+\))/g)
    
    return parts.map((part, i) => {
      const match = part.match(/@\[([^\]]+)\]\(([^)]+)\)/)
      if (match) {
        return (
          <span key={i} className="inline-flex items-center bg-blue-100 text-blue-700 px-1 rounded text-sm">
            @{match[1]}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm 
                   focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:bg-slate-100 disabled:text-slate-400
                   resize-none"
        />
        
        {/* @ hint icon */}
        <div className="absolute right-2 bottom-2 text-slate-400">
          <AtSymbolIcon className="w-4 h-4" />
        </div>
      </div>

      {/* Mention dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-500">
              Searching...
            </div>
          ) : searchResults.length > 0 ? (
            <div className="py-1">
              {searchResults.map((staff, index) => (
                <button
                  key={staff.person_id}
                  type="button"
                  onClick={() => insertMention(staff)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                    index === selectedIndex
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-medium">
                    {staff.first_name} {staff.last_name}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {staff.email}
                  </span>
                </button>
              ))}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="px-3 py-2 text-sm text-slate-500">
              No staff found matching "{searchQuery}"
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">
              Type at least 2 characters to search...
            </div>
          )}
        </div>
      )}

      {/* Mention preview */}
      {value && extractMentions(value).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {extractMentions(value).map((email, i) => {
            const nameMatch = value.match(new RegExp(`@\\[([^\\]]+)\\]\\(${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))
            const displayName = nameMatch ? nameMatch[1] : email
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
              >
                <AtSymbolIcon className="w-3 h-3" />
                {displayName}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Parse mentions from text and return just the emails
 */
export function parseMentionEmails(text: string): string[] {
  if (!text) return []
  const pattern = /@\[[^\]]+\]\(([^)]+)\)/g
  const emails: string[] = []
  let match
  while ((match = pattern.exec(text)) !== null) {
    emails.push(match[1])
  }
  return [...new Set(emails)]
}

/**
 * Convert mention format for display (strip the email part)
 */
export function formatMentionForDisplay(text: string): string {
  if (!text) return ''
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
}
