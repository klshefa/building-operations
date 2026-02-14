/**
 * Helper function to compute the cookie domain for SSO
 * 
 * Takes a hostname like "ops.shefaschool.org" and returns ".shefaschool.org"
 * This allows cookies to be shared across all subdomains
 * 
 * @returns The cookie domain (e.g., ".shefaschool.org") or undefined if not in production
 */
export function getCookieDomain(): string | undefined {
  // Only set domain in production
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }

  const host = process.env.NEXT_PUBLIC_SITE_HOST ?? "";
  
  if (!host) {
    console.warn("NEXT_PUBLIC_SITE_HOST not set - cookies will not be shared across subdomains");
    return undefined;
  }

  const parts = host.split(".");
  
  // Need at least 2 parts (e.g., "shefaschool.org")
  if (parts.length < 2) {
    console.warn(`Invalid host format: ${host} - expected format: subdomain.domain.com`);
    return undefined;
  }

  // Return the last 2 parts with leading dot (e.g., ".shefaschool.org")
  return `.${parts.slice(-2).join(".")}`;
}
