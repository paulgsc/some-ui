/**
 * — TabLedger v2 entry point
 *
 * Mounts:
 *   1. FloatingHUD (chip, segment picker, node panel) — z-index: 9999
 *   2. BannerMarquee (sticky bottom intent banner) — z-index: 9000
 *
 * CSS is split: hud.css and banner.css injected separately.
 */

import { getOverlayRoot } from "@some-extension/common/lib/layers"
import rawBannerCSS from "@tab/styles/banner.css?inline"
import rawHudCSS from "@tab/styles/hud.css?inline"
import type { NodeState, OutboundMessage, Outcome, Segment } from "@tab/types"
import { MIN_ACTIVE_MS_TO_REGISTER } from "@tab/types"
import { BannerMarquee } from "@tab/ui/banner-marquee"
import { FloatingHUD } from "@tab/ui/floating-hud"

// ─── Guards ───────────────────────────────────────────────────────────────────

const BLOCKED_PROTOCOLS = new Set([
  "chrome-extension:",
  "moz-extension:",
  "about:",
  "chrome:",
])

function shouldInject(): boolean {
  return !BLOCKED_PROTOCOLS.has(location.protocol)
}

// ─── Style injection ──────────────────────────────────────────────────────────

function injectStyles(id: string, css: string): void {
  if (document.getElementById(id)) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = css
  document.documentElement.appendChild(style)
}

// ─── Messaging ────────────────────────────────────────────────────────────────

async function sendMessage(msg: object): Promise<OutboundMessage> {
  return browser.runtime.sendMessage(msg) as Promise<OutboundMessage>
}

// ─── Active time tracking (client-side, for gate display) ────────────────────

let localActiveMs = 0
let activeStartMs: number | null = null

function startLocalActiveClock(): void {
  activeStartMs = Date.now()
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (activeStartMs !== null) {
        localActiveMs += Date.now() - activeStartMs
        activeStartMs = null
      }
    } else {
      activeStartMs = Date.now()
    }
  })
}

function getLocalActiveMs(): number {
  if (activeStartMs === null) return localActiveMs
  return localActiveMs + (Date.now() - activeStartMs)
}

// ─── Tab ID ───────────────────────────────────────────────────────────────────

let ownTabId: number | null = null

async function resolveTabId(): Promise<number | null> {
  if (ownTabId !== null) return ownTabId
  try {
    const resp = await sendMessage({ type: "GET_OWN_TAB_ID" })
    if (resp.type === "OWN_TAB_ID") ownTabId = resp.tabId
  } catch {}
  return ownTabId
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

async function poll(
  tabId: number,
  hud: FloatingHUD,
  banner: BannerMarquee
): Promise<void> {
  try {
    const resp = await sendMessage({ type: "GET_NODE_STATE", tabId })
    if (resp.type !== "NODE_STATE") return

    const activeMs = getLocalActiveMs()
    const nodeState: NodeState = resp.state ?? {
      tabId,
      url: location.href,
      segment: null,
      visits: [],
      lastActiveMs: 0,
      activeStart: null,
      lastPostError: null,
    }

    hud.updateNode(nodeState, activeMs)
    banner.setNode(nodeState) // ← drives ribbon clock + segment sync
  } catch {}
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  if (!shouldInject()) return

  injectStyles("__tl2_hud_styles__", rawHudCSS)
  injectStyles("__tl2_banner_styles__", rawBannerCSS)

  startLocalActiveClock()

  // ── HUD ────────────────────────────────────────────────────────────────────
  const hud = new FloatingHUD({
    onSegmentSelect: async (segment: Segment): Promise<void> => {
      const tabId = await resolveTabId()
      if (!tabId) return
      await sendMessage({ type: "SET_SEGMENT", tabId, segment })
      await poll(tabId, hud, banner)
    },

    onOutcomeRegister: async (outcome: Outcome): Promise<void> => {
      const tabId = await resolveTabId()
      if (!tabId) return

      const activeMs = getLocalActiveMs()
      if (activeMs < MIN_ACTIVE_MS_TO_REGISTER) {
        hud.onRegisterError(
          `Need ${Math.ceil((MIN_ACTIVE_MS_TO_REGISTER - activeMs) / 1000)}s more active time`
        )
        return
      }

      try {
        const resp = await sendMessage({
          type: "REGISTER_SESSION",
          tabId,
          outcome,
        })
        if (resp.type === "OK") {
          hud.onRegisterSuccess(outcome)
        } else if (resp.type === "ERR") {
          hud.onRegisterError(resp.message)
        }
      } catch (err) {
        hud.onRegisterError(
          err instanceof Error ? err.message : "Unknown error"
        )
      }

      const tabId2 = await resolveTabId()
      if (tabId2) await poll(tabId2, hud, banner)
    },
  })

  const root = getOverlayRoot()

  hud.mount(root)

  // ── Banner ─────────────────────────────────────────────────────────────────
  const banner = new BannerMarquee({
    toggleCombo: { key: "b", alt: true },
  })
  banner.mount(root)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const tabId = await resolveTabId()
  if (!tabId) return

  // Initial state
  await poll(tabId, hud, banner)

  // Fetch banner text from server
  await banner.fetchAndUpdate()

  // Sync banner segment with node state
  const resp = await sendMessage({ type: "GET_NODE_STATE", tabId })
  if (resp.type === "NODE_STATE" && resp.state?.segment) {
    banner.setSegment(resp.state.segment)
  }

  // Poll every second
  setInterval(() => void poll(tabId, hud, banner), 1000)

  // Refresh banner every 60s
  setInterval(() => void banner.fetchAndUpdate(), 60_000)
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

if (document.documentElement) {
  void init()
} else {
  document.addEventListener("DOMContentLoaded", () => void init())
}

export {}
