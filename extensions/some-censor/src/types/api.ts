/**
 * Contract for the localhost persistence API.
 * Background script is the only consumer of the concrete client;
 * these types are shared for documentation clarity.
 */

import type { WhitelistEntry } from "./messages"

export type ApiConfig = {
  /** e.g. "http://localhost:7474" — configurable via extension storage */
  baseUrl: string
}

// ── Request / Response shapes ─────────────────────────────────────────────────

export type GetWhitelistResponse = { channels: WhitelistEntry[] }
export type PostWhitelistRequest = { channelId: string; channelName: string }
export type PostWhitelistResponse = { channel: WhitelistEntry }
export type DeleteWhitelistResponse = { ok: true }

export type GetSettingsResponse = { enabled: boolean }
export type PutSettingsRequest = { enabled: boolean }
export type PutSettingsResponse = { enabled: boolean }

// ── API Error ─────────────────────────────────────────────────────────────────

export type ApiError = {
  status: number
  message: string
}
