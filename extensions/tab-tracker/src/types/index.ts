export type TabRecord = {
  tabId: number
  url: string
  title: string
  favicon: string
  totalMs: number
  sessionMs: number
  lastActivated: number // Unix timestamp when became active, 0 if inactive
  isActive: boolean
  intentional: boolean
  buckets: Array<number> // 15-minute time buckets for sparkline
  bucketStart: number // timestamp of first bucket epoch
}

export type LedgerState = {
  records: Record<number, TabRecord>
  activeTabId: number | null
  sessionStart: number
  seenNeglectPairs: Array<string> // "activeTabId_neglectedTabId" pairs already shown
}

// ─── Message protocol ─────────────────────────────────────────────────────────
// All messages the content/popup scripts can send to the background.
// GET_OWN_TAB_ID is folded in here so the message handler can narrow via
// exhaustive switch without any unsafe casts.

export type InboundMessage =
  | { type: "GET_OWN_TAB_ID" }
  | { type: "GET_TAB_STATE"; tabId: number }
  | { type: "GET_FULL_STATE" }
  | { type: "PIN_TAB"; tabId: number }
  | { type: "RESET_SESSION" }

export type OutboundMessage =
  | { type: "OWN_TAB_ID"; tabId: number | null }
  | {
      type: "TAB_STATE"
      record: TabRecord | null
      now: number
      neglect: string | null
    }
  | { type: "FULL_STATE"; state: LedgerState; now: number }
  | { type: "OK" }

// ─── Badge ────────────────────────────────────────────────────────────────────

export type BadgeTier = "green" | "amber" | "red" | "violet"

export function getBadgeTier(ms: number): BadgeTier {
  const m = ms / 60_000
  if (m < 15) return "green"
  if (m < 45) return "amber"
  if (m < 90) return "red"
  return "violet"
}

export const BADGE_COLORS: Record<BadgeTier, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#7c3aed",
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function formatMsShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${totalSec}s`
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_KEY = "tabledger_state"
export const BUCKET_SIZE_MS = 15 * 60 * 1000 // 15 minutes
export const NEGLECT_ACTIVE_THRESHOLD_MS = 45 * 60 * 1000
export const NEGLECT_IDLE_THRESHOLD_MS = 5 * 60 * 1000
