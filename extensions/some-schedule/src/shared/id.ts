/**
 *
 * UUID v4 generation compatible with both service worker
 * and content script contexts (no Node.js crypto module).
 */

export function uuid(): string {
  return crypto.randomUUID()
}

export function isoNow(): string {
  return new Date().toISOString()
}
