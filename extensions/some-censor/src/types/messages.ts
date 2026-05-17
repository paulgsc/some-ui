/**
 * Message protocol between content/popup ↔ background.
 * All type-only — zero runtime overhead.
 */

// ── Background-bound messages (requests) ─────────────────────────────────────

export type IsWhitelistedMsg = { type: "IS_WHITELISTED"; channelId: string }
export type AddWhitelistMsg = {
  type: "ADD_WHITELIST"
  channelId: string
  channelName: string
}
export type RemoveWhitelistMsg = { type: "REMOVE_WHITELIST"; channelId: string }
export type GetWhitelistMsg = { type: "GET_WHITELIST" }
export type GetEnabledMsg = { type: "GET_ENABLED" }
export type SetEnabledMsg = { type: "SET_ENABLED"; enabled: boolean }

export type BgRequest =
  | IsWhitelistedMsg
  | AddWhitelistMsg
  | RemoveWhitelistMsg
  | GetWhitelistMsg
  | GetEnabledMsg
  | SetEnabledMsg

// ── Background responses ──────────────────────────────────────────────────────

export type IsWhitelistedResp = { ok: true; whitelisted: boolean }
export type WhitelistResp = { ok: true; channels: WhitelistEntry[] }
export type EnabledResp = { ok: true; enabled: boolean }
export type OkResp = { ok: true }
export type ErrResp = { ok: false; error: string }

export type BgResponse =
  | IsWhitelistedResp
  | WhitelistResp
  | EnabledResp
  | OkResp
  | ErrResp

// ── Background → content broadcast ───────────────────────────────────────────

export type EnabledChangedBroadcast = {
  type: "ENABLED_CHANGED"
  enabled: boolean
}
export type ChannelWhitelistedBroadcast = {
  type: "CHANNEL_WHITELISTED"
  channelId: string
}

export type BgBroadcast = EnabledChangedBroadcast | ChannelWhitelistedBroadcast

// ── Shared domain types ───────────────────────────────────────────────────────

export type WhitelistEntry = {
  channelId: string
  channelName: string
  addedAt: number // epoch ms
}
