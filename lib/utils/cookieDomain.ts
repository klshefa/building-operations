/**
 * Helper function to compute the cookie domain for SSO
 */
export function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }

  const host = process.env.NEXT_PUBLIC_SITE_HOST ?? "";
  
  if (!host) {
    return undefined;
  }

  const parts = host.split(".");
  
  if (parts.length < 2) {
    return undefined;
  }

  return `.${parts.slice(-2).join(".")}`;
}
