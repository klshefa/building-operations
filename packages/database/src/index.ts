/**
 * @shefa/database — Shared Supabase client helpers for the Shefa platform.
 *
 * Provides canonical browser, server, and admin client factories with
 * SSO-aware cookie handling across all portal subdomains.
 *
 * Usage (browser):
 *   import { createClient } from '@shefa/database/client'
 *
 * Usage (server):
 *   import { createClient } from '@shefa/database/server'
 *
 * Usage (admin / service role):
 *   import { createAdminClient } from '@shefa/database/admin'
 *
 * Usage (cookie domain helper):
 *   import { getCookieDomain } from '@shefa/database'
 */

export { getCookieDomain } from './cookieDomain'
export { createAdminClient } from './admin'
