'use client'

import { format, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import type { OpsEvent, EventSource } from '@/lib/types'
import {
  MapPinIcon,
  ClockIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

const sourceLabels: Record<EventSource, string> = {
  bigquery_group: 'VC Event',
  bigquery_resource: 'VC Resource',
  calendar_staff: 'Staff Cal',
  calendar_ls: 'LS Cal',
  calendar_ms: 'MS Cal',
  manual: 'Manual',
}

const sourceColors: Record<EventSource, string> = {
  bigquery_group: 'bg-purple-100 text-purple-700',
  bigquery_resource: 'bg-blue-100 text-blue-700',
  calendar_staff: 'bg-green-100 text-green-700',
  calendar_ls: 'bg-orange-100 text-orange-700',
  calendar_ms: 'bg-teal-100 text-teal-700',
  manual: 'bg-slate-100 text-slate-700',
}

interface EventCardProps {
  event: OpsEvent
  onClick?: () => void
  compact?: boolean
}

export default function EventCard({ event, onClick, compact = false }: EventCardProps) {
  const startDate = parseISO(event.start_date)
  const hasTeamNeeds = event.needs_program_director || event.needs_office || event.needs_it || event.needs_security || event.needs_facilities

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        onClick={onClick}
        className={`p-3 rounded-lg border cursor-pointer transition-all ${
          event.is_hidden
            ? 'bg-slate-50 border-slate-200 opacity-60'
            : event.has_conflict && !event.conflict_ok
            ? 'bg-red-50 border-red-200'
            : 'bg-white border-slate-200 hover:border-shefa-blue-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColors[event.primary_source]}`}>
                {sourceLabels[event.primary_source]}
              </span>
              {event.is_hidden && <EyeSlashIcon className="w-3 h-3 text-slate-400" />}
              {event.has_conflict && !event.conflict_ok && (
                <ExclamationTriangleIcon className="w-3 h-3 text-red-500" />
              )}
            </div>
            <h4 className="font-medium text-slate-800 truncate">{event.title}</h4>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              {event.start_time && (
                <span className="flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  {event.start_time}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="w-3 h-3" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        event.is_hidden
          ? 'bg-slate-50 border-slate-200 opacity-60'
          : event.has_conflict && !event.conflict_ok
          ? 'bg-red-50 border-red-200'
          : 'bg-white border-slate-200 hover:border-shefa-blue-300 hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[event.primary_source]}`}>
              {sourceLabels[event.primary_source]}
            </span>
            {event.is_hidden && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 flex items-center gap-1">
                <EyeSlashIcon className="w-3 h-3" />
                Hidden
              </span>
            )}
            {event.has_conflict && !event.conflict_ok && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3 h-3" />
                Conflict
              </span>
            )}
          </div>
          <h3 className="font-semibold text-slate-800 text-lg">{event.title}</h3>
          {event.description && (
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{event.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold text-shefa-blue-600">
            {format(startDate, 'd')}
          </div>
          <div className="text-xs text-slate-500 uppercase">
            {format(startDate, 'MMM')}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-3">
        {event.start_time && (
          <span className="flex items-center gap-1">
            <ClockIcon className="w-4 h-4 text-slate-400" />
            {event.start_time}
            {event.end_time && ` - ${event.end_time}`}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1">
            <MapPinIcon className="w-4 h-4 text-slate-400" />
            {event.location}
          </span>
        )}
        {event.expected_attendees && (
          <span className="flex items-center gap-1">
            <UsersIcon className="w-4 h-4 text-slate-400" />
            {event.expected_attendees} expected
          </span>
        )}
      </div>

      {/* Team Indicators */}
      {hasTeamNeeds && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
          {event.needs_program_director && (
            <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
              <UserGroupIcon className="w-3 h-3" />
              Program
            </span>
          )}
          {event.needs_office && (
            <span className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-700 flex items-center gap-1">
              <BuildingOfficeIcon className="w-3 h-3" />
              Office
            </span>
          )}
          {event.needs_it && (
            <span className="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 flex items-center gap-1">
              <ComputerDesktopIcon className="w-3 h-3" />
              IT
            </span>
          )}
          {event.needs_security && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
              <ShieldCheckIcon className="w-3 h-3" />
              Security
            </span>
          )}
          {event.needs_facilities && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <WrenchScrewdriverIcon className="w-3 h-3" />
              Facilities
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
