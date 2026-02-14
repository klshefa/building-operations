/**
 * Get the appropriate cookie domain for cross-subdomain auth
 */
export function getCookieDomain(): string | undefined {
  // In production, always use .shefaschool.org
  if (process.env.NODE_ENV === 'production') {
    return '.shefaschool.org'
  }
  
  // Client-side check for shefaschool.org
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname.includes('shefaschool.org')) {
      return '.shefaschool.org'
    }
  }
  
  // localhost or development - no domain restriction
  return undefined
}
