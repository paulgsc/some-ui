// ─── Segments ─────────────────────────────────────────────────────────────────

export const SEGMENTS = [
  "math",
  "dsa",
  "systems",
  "infra",
  "language",
  "career",
  "leisure",
] as const

export type Segment = (typeof SEGMENTS)[number]

export const SEGMENT_DISPLAY: Record<
  Segment,
  { label: string; abbr: string; accent: string }
> = {
  math: { label: "Mathematics", abbr: "MTH", accent: "#60a5fa" },
  dsa: { label: "DSA", abbr: "DSA", accent: "#34d399" },
  systems: { label: "Systems", abbr: "SYS", accent: "#f97316" },
  infra: { label: "Infra", abbr: "INF", accent: "#a78bfa" },
  language: { label: "Language", abbr: "LNG", accent: "#f43f5e" },
  career: { label: "Career", abbr: "CAR", accent: "#facc15" },
  leisure: { label: "Leisure", abbr: "LSR", accent: "#94a3b8" },
}

// ─── Outcome ──────────────────────────────────────────────────────────────────

export type Outcome = "Progress" | "Stuck" | "Review"

export const OUTCOMES: Array<Outcome> = ["Progress", "Stuck", "Review"]

export const OUTCOME_CONFIG: Record<
  Outcome,
  { symbol: string; color: string }
> = {
  Progress: { symbol: "↑", color: "#34d399" },
  Stuck: { symbol: "×", color: "#f43f5e" },
  Review: { symbol: "↺", color: "#facc15" },
}

// ─── Node state (per tab, local) ──────────────────────────────────────────────

export type VisitRecord = {
  outcome: Outcome
  timestamp: number // unix ms — from server if available, local fallback
}

export type NodeState = {
  tabId: number
  url: string
  segment: Segment | null
  visits: Array<VisitRecord>
  lastActiveMs: number
  activeStart: number | null // Date.now() when tab became active, null if inactive
  lastPostError: string | null
}

// ─── Banner state ─────────────────────────────────────────────────────────────

export type BannerState = {
  text: string
  visible: boolean
  lastFetchError: string | null
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type InboundMessage =
  | { type: "GET_OWN_TAB_ID" }
  | { type: "GET_NODE_STATE"; tabId: number }
  | { type: "SET_SEGMENT"; tabId: number; segment: Segment }
  | { type: "REGISTER_SESSION"; tabId: number; outcome: Outcome }
  | { type: "TICK_ACTIVE"; tabId: number }
  | { type: "GET_BANNER" }
  | { type: "SET_BANNER_TEXT"; text: string }

export type OutboundMessage =
  | { type: "OWN_TAB_ID"; tabId: number | null }
  | { type: "NODE_STATE"; state: NodeState | null }
  | { type: "BANNER_STATE"; banner: BannerState }
  | { type: "OK" }
  | { type: "ERR"; message: string }

// ─── Config ───────────────────────────────────────────────────────────────────

export const MIN_ACTIVE_MS_TO_REGISTER = 5 * 60 * 1000 // 5 minutes

// ─── Formatters (kept for popup + other consumers) ────────────────────────────

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
