/**
 * SSO cookie domain helper.
 *
 * Computes the shared cookie domain from NEXT_PUBLIC_SITE_HOST so that
 * Supabase auth cookies are scoped to the root domain (e.g. ".shefaschool.org")
 * and shared across all portal subdomains.
 *
 * Only sets a domain in production — in development, cookies default to
 * the current hostname (localhost).
 *
 * @source dismissal-app, attendance-portal, sharks-portal
 *         (lib/utils/cookieDomain.ts — identical across all three)
 */
export function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }

  const host = process.env.NEXT_PUBLIC_SITE_HOST ?? "";

  if (!host) {
    console.warn("NEXT_PUBLIC_SITE_HOST not set - cookies will not be shared across subdomains");
    return undefined;
  }

  const parts = host.split(".");

  if (parts.length < 2) {
    console.warn(`Invalid host format: ${host} - expected format: subdomain.domain.com`);
    return undefined;
  }

  return `.${parts.slice(-2).join(".")}`;
}
