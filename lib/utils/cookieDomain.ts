/**
 * Helper function to compute the cookie domain
 * 
 * Returns undefined to keep cookies scoped to this app only,
 * preventing cross-app authentication conflicts.
 * 
 * @returns undefined - cookies are app-specific, not shared across subdomains
 */
export function getCookieDomain(): string | undefined {
  // Don't share cookies across subdomains - each app manages its own auth
  // This prevents logout/login conflicts between ops portal and other apps
  return undefined
}
