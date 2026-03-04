import type { TabRecord } from "@tab/types"
import { BADGE_COLORS, getBadgeTier } from "@tab/types"
import browser from "webextension-polyfill"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PollResult = {
  record: TabRecord
  now: number
  elapsed: number
  sessionElapsed: number
  neglect: string | null
  isFirstPoll: boolean
}

export type PollCallback = (result: PollResult) => void

// ─── Constants ────────────────────────────────────────────────────────────────

const TOAST_THRESHOLDS = [15 * 60 * 1000, 45 * 60 * 1000, 90 * 60 * 1000]
const POLL_INTERVAL = 1000

// ─── State ────────────────────────────────────────────────────────────────────

let currentTabId: number | null = null
let isFirstPoll = true
const firedThresholds = new Set<number>()

// ─── Compute elapsed values ───────────────────────────────────────────────────

export function computeElapsed(
  record: TabRecord,
  now: number
): { elapsed: number; sessionElapsed: number } {
  const elapsed =
    record.isActive && record.lastActivated > 0
      ? record.totalMs + (now - record.lastActivated)
      : record.totalMs

  const sessionElapsed =
    record.isActive && record.lastActivated > 0
      ? record.sessionMs + (now - record.lastActivated)
      : record.sessionMs

  return { elapsed, sessionElapsed }
}

// ─── Threshold detection ──────────────────────────────────────────────────────

export type ThresholdFire = {
  threshold: number
  color: string
}

export function checkThresholds(elapsed: number): ThresholdFire | null {
  for (const threshold of TOAST_THRESHOLDS) {
    if (elapsed >= threshold && !firedThresholds.has(threshold)) {
      firedThresholds.add(threshold)
      const tier = getBadgeTier(elapsed)
      return { threshold, color: BADGE_COLORS[tier] }
    }
  }
  return null
}

// ─── Derive tags ──────────────────────────────────────────────────────────────

export function deriveTags(
  record: TabRecord,
  elapsed: number,
  sessionElapsed: number,
  sessionTotal: number
): Array<string> {
  const tags: Array<string> = []

  if (record.isActive) tags.push("live")
  if (record.intentional) tags.push("intentional")

  // deep work: >45m focused session
  if (sessionElapsed >= 45 * 60_000) tags.push("deep_work")

  // rabbit hole: >40% of total session time
  if (sessionTotal > 0 && sessionElapsed / sessionTotal > 0.4)
    tags.push("rabbit_hole")

  // neglected: <5m session while session is long
  if (sessionElapsed < 5 * 60_000 && elapsed > 0) tags.push("neglected")

  return tags
}

// ─── Style injection ──────────────────────────────────────────────────────────

export function injectStyles(cssText: string): void {
  const id = "__tabledger_styles__"
  if (document.getElementById(id)) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = cssText
  document.documentElement.appendChild(style)
}

// ─── Polling ──────────────────────────────────────────────────────────────────

async function getTabId(): Promise<number | null> {
  if (currentTabId !== null) return currentTabId
  try {
    const resp = await browser.runtime.sendMessage({ type: "GET_OWN_TAB_ID" })
    if (resp?.tabId) currentTabId = resp.tabId
  } catch {}
  return currentTabId
}

async function fetchTabState(
  tabId: number
): Promise<{ record: TabRecord; now: number; neglect: string | null } | null> {
  try {
    const resp = await browser.runtime.sendMessage({
      type: "GET_TAB_STATE",
      tabId,
    })
    if (!resp?.record) return null
    return resp
  } catch {
    return null
  }
}

export function startPolling(
  onPoll: PollCallback,
  onThreshold: (text: string, color: string) => void
): void {
  async function poll(): Promise<void> {
    const tabId = await getTabId()
    if (!tabId) return

    const state = await fetchTabState(tabId)
    if (!state) return

    const { record, now, neglect } = state
    const { elapsed, sessionElapsed } = computeElapsed(record, now)

    const wasFirst = isFirstPoll
    isFirstPoll = false

    // Threshold toasts
    const fired = checkThresholds(elapsed)
    if (fired) {
      const { formatMsShort } = await import("@tab/types")
      onThreshold(`${formatMsShort(fired.threshold)} on this tab`, fired.color)
    }

    onPoll({
      record,
      now,
      elapsed,
      sessionElapsed,
      neglect: neglect ?? null,
      isFirstPoll: wasFirst,
    })
  }

  setInterval(poll, POLL_INTERVAL)
  poll()
}
