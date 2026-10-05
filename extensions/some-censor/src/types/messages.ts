/**
 * Message protocol between content/popup ↔ background.
 * All type-only — zero runtime overhead.
 */

// ── Background-bound messages (requests) ─────────────────────────────────────

type IsWhitelistedMsg = { type: "IS_WHITELISTED"; channelId: string }
type AddWhitelistMsg = {
  type: "ADD_WHITELIST"
  channelId: string
  channelName: string
}
type RemoveWhitelistMsg = { type: "REMOVE_WHITELIST"; channelId: string }
type GetWhitelistMsg = { type: "GET_WHITELIST" }
type GetEnabledMsg = { type: "GET_ENABLED" }
type SetEnabledMsg = { type: "SET_ENABLED"; enabled: boolean }

export type BgRequest =
  | IsWhitelistedMsg
  | AddWhitelistMsg
  | RemoveWhitelistMsg
  | GetWhitelistMsg
  | GetEnabledMsg
  | SetEnabledMsg

// ── Background responses ──────────────────────────────────────────────────────

type IsWhitelistedResp = { ok: true; whitelisted: boolean }
type WhitelistResp = { ok: true; channels: Array<WhitelistEntry> }
type EnabledResp = { ok: true; enabled: boolean }
type OkResp = { ok: true }
type ErrResp = { ok: false; error: string }

export type BgResponse =
  | IsWhitelistedResp
  | WhitelistResp
  | EnabledResp
  | OkResp
  | ErrResp

// ── Background → content broadcast ───────────────────────────────────────────

type EnabledChangedBroadcast = {
  type: "ENABLED_CHANGED"
  enabled: boolean
}
type ChannelWhitelistedBroadcast = {
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
