/**
 * Shared resource-matching utilities for the Building Operations portal.
 *
 * IMPORTANT — ID contract:
 *   `ops_resources.id`  ===  Veracross BigQuery `Resource_ID`
 *   These are the SAME integer ID space. When the Veracross REST API returns
 *   a reservation with a `resource_id` (or `resource.id`), that value also
 *   lives in this same space.
 *
 * Every route that compares a Veracross reservation to a local resource MUST
 * use the functions below instead of inline parsing.  See
 * `.cursor/rules/resource-matching.mdc` for the full contract.
 */

// ---------------------------------------------------------------------------
// Veracross API field parsing
// ---------------------------------------------------------------------------

export interface VcResourceInfo {
  /** Human-readable resource name (e.g. "Beit Midrash") */
  name: string
  /** Veracross Resource_ID — same ID space as ops_resources.id */
  id: number | null
}

/**
 * Safely extract the resource name and resource ID from a Veracross API
 * reservation object.
 *
 * The API may return `res.resource` as either:
 *   - a plain string   ("Beit Midrash")
 *   - an embedded object ({ id: 42, description: "Beit Midrash" })
 *
 * This function handles both without producing "[object Object]".
 */
export function parseVcResourceField(res: any): VcResourceInfo {
  const raw = res.resource
  const name =
    typeof raw === 'string'
      ? raw
      : (raw?.description || raw?.name || '')
  const id =
    res.resource_id ??
    (typeof raw === 'object' && raw !== null ? raw?.id : null) ??
    null
  return {
    name: String(name).trim(),
    id: id != null ? Number(id) : null,
  }
}

// ---------------------------------------------------------------------------
// Resource-name normalisation & comparison
// ---------------------------------------------------------------------------

/**
 * Normalise a resource name for comparison:
 *   - lowercase
 *   - strip leading room numbers  ("614B Classroom" → "b classroom")
 *   - remove non-alphanumeric chars (except spaces / hyphens)
 *   - collapse whitespace
 */
export function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^\d+\s+/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Return `true` when two resource names refer to the same physical space.
 *
 * After normalisation the names must either be equal or one must be a
 * prefix of the other followed by a space (handles grouped resources such
 * as "Ulam" vs "Ulam 1").
 */
export function resourceNamesMatch(
  localName: string,
  vcName: string,
): boolean {
  const a = normalizeResourceName(localName)
  const b = normalizeResourceName(vcName)
  if (!a || !b) return false
  if (a === b) return true
  return a.startsWith(b + ' ') || b.startsWith(a + ' ')
}

// ---------------------------------------------------------------------------
// High-level matchers
// ---------------------------------------------------------------------------

/**
 * Determine whether a Veracross API reservation object belongs to a given
 * local resource.
 *
 * Matching strategy (in order):
 *   1. If the API provides a numeric resource_id, compare it to the local
 *      resource ID.  If the IDs differ, return `false` immediately — do NOT
 *      fall through to name matching (prevents cross-resource false positives).
 *   2. If no resource_id is available, fall back to normalised name matching.
 */
export function doesVcReservationMatchResource(
  res: any,
  localResourceId: number,
  localDescription: string,
  localAbbreviation?: string,
): boolean {
  const vc = parseVcResourceField(res)

  if (vc.id != null && vc.id === localResourceId) return true
  if (vc.id != null) return false // ID exists but didn't match — different resource

  if (!vc.name) return false
  return (
    resourceNamesMatch(localDescription, vc.name) ||
    (localAbbreviation
      ? resourceNamesMatch(localAbbreviation, vc.name)
      : false)
  )
}

/**
 * Check whether a substring match sits on a word boundary — i.e. the
 * match is not a prefix of a longer token.  "101" matches inside
 * "101 Beit Midrash" but NOT inside "1012 Library".
 */
function isWordBoundaryMatch(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle)
  if (idx === -1) return false
  const afterIdx = idx + needle.length
  if (afterIdx >= haystack.length) return true
  const charAfter = haystack[afterIdx]
  return charAfter === ' ' || charAfter === '-' || charAfter === ',' || charAfter === '/'
}

/**
 * Check whether an event's free-text `location` field refers to a given
 * resource.
 *
 * The match is ONE-DIRECTIONAL: the location string must *contain* the
 * resource description (or abbreviation).  We intentionally do NOT check
 * the reverse direction (`desc.includes(loc)`) because short / generic
 * location strings would otherwise match unrelated resources.
 *
 * Abbreviation matches require a word boundary so that abbreviation "101"
 * matches "101 Beit Midrash" but NOT "1012 Library".
 */
export function locationFuzzyMatch(
  eventLocation: string,
  resourceDescription: string,
  resourceAbbreviation?: string,
): boolean {
  const loc = eventLocation.toLowerCase().trim()
  const desc = resourceDescription.toLowerCase().trim()
  if (!loc || !desc) return false
  if (loc === desc) return true
  if (loc.includes(desc)) return true
  if (resourceAbbreviation) {
    const abbr = resourceAbbreviation.toLowerCase().trim()
    if (abbr && (loc === abbr || isWordBoundaryMatch(loc, abbr))) return true
  }
  return false
}
