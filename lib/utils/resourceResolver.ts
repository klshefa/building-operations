/**
 * Resource Resolver — the ONLY way to map external identifiers to resource IDs.
 *
 * All resource matching in the system MUST go through this module.
 * Never do substring matching, fuzzy matching, or inline parsing.
 *
 * How it works:
 *   1. External text (room name, location, abbreviation, etc.) is normalised
 *   2. Looked up in `ops_resource_aliases` table for an exact match
 *   3. Returns the `resource_id` or null if no match
 *
 * If a lookup returns null, the text should be logged so an admin can
 * add the missing alias via the admin UI.
 */

import { SupabaseClient } from '@supabase/supabase-js'

let aliasCache: Map<string, number> | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load all aliases into an in-memory map for fast lookup.
 * Cached for 5 minutes to avoid hitting the DB on every event.
 */
async function loadAliasCache(supabase: SupabaseClient): Promise<Map<string, number>> {
  if (aliasCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return aliasCache
  }

  const { data, error } = await supabase
    .from('ops_resource_aliases')
    .select('resource_id, alias_value')

  if (error) {
    console.error('[ResourceResolver] Failed to load aliases:', error.message)
    return aliasCache || new Map()
  }

  const map = new Map<string, number>()
  for (const row of data || []) {
    map.set(row.alias_value, row.resource_id)
  }

  aliasCache = map
  cacheTimestamp = Date.now()
  return map
}

/**
 * Force-refresh the alias cache (call after adding new aliases).
 */
export function invalidateAliasCache(): void {
  aliasCache = null
  cacheTimestamp = 0
}

/**
 * Resolve a text string to a resource_id using exact lookup in the alias table.
 *
 * Handles these formats:
 *   - Resource descriptions: "Beit Midrash", "1012 Library"
 *   - Abbreviations: "101", "1012"
 *   - Veracross IDs (as strings): "155", "164"
 *   - Class schedule room descriptions (whatever the API returns)
 *   - Google Calendar location strings
 *
 * Returns null if no match found.
 */
export async function resolveResourceId(
  text: string | null | undefined,
  supabase: SupabaseClient,
): Promise<number | null> {
  if (!text) return null
  const normalized = text.toLowerCase().trim()
  if (!normalized) return null

  const cache = await loadAliasCache(supabase)
  return cache.get(normalized) ?? null
}

/**
 * Resolve a numeric Veracross resource_id directly.
 * Since ops_resources.id === Veracross Resource_ID, this is just validation.
 */
export async function resolveVcResourceId(
  vcResourceId: number | null | undefined,
  supabase: SupabaseClient,
): Promise<number | null> {
  if (vcResourceId == null) return null
  const cache = await loadAliasCache(supabase)
  return cache.get(String(vcResourceId)) ?? null
}

/**
 * Parse a Veracross API reservation object and resolve its resource_id.
 *
 * The API may return `res.resource` as a string or an object.
 * It also has top-level `resource_id` and `resource_description` fields.
 */
export async function resolveVcReservationResource(
  res: any,
  supabase: SupabaseClient,
): Promise<number | null> {
  // First try the numeric resource_id (most reliable)
  const directId = res.resource_id ?? (typeof res.resource === 'object' ? res.resource?.id : null)
  if (directId != null) {
    const resolved = await resolveVcResourceId(Number(directId), supabase)
    if (resolved != null) return resolved
  }

  // Fall back to description text
  const descText =
    res.resource_description ??
    (typeof res.resource === 'string' ? res.resource : res.resource?.description) ??
    null
  return resolveResourceId(descText, supabase)
}

/**
 * Check if a Veracross reservation belongs to a specific local resource.
 */
export async function doesReservationMatchResource(
  res: any,
  localResourceId: number,
  supabase: SupabaseClient,
): Promise<boolean> {
  const resolved = await resolveVcReservationResource(res, supabase)
  return resolved === localResourceId
}

/**
 * Resolve a class schedule room to a resource_id.
 * Uses the room description (and falls back to abbreviation/name).
 */
export async function resolveClassScheduleRoom(
  room: any,
  supabase: SupabaseClient,
): Promise<number | null> {
  if (!room) return null

  // Try description first (most specific)
  const desc = room.description || room.name || ''
  const resolved = await resolveResourceId(desc, supabase)
  if (resolved != null) return resolved

  // Try abbreviation
  if (room.abbreviation) {
    const byAbbrev = await resolveResourceId(room.abbreviation, supabase)
    if (byAbbrev != null) return byAbbrev
  }

  // Try numeric ID if Veracross provides one
  if (room.id != null) {
    const byId = await resolveVcResourceId(Number(room.id), supabase)
    if (byId != null) return byId
  }

  return null
}
