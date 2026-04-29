
/**
 * content.ts — TabLedger v2 entry point
 *
 * Mounts:
 *   1. FloatingHUD (chip, segment picker, node panel) — z-index: 9999
 *   2. BannerMarquee (sticky bottom intent banner) — z-index: 9000
 *
 * CSS is split: hud.css and banner.css injected separately.
 */

import rawHudCSS    from "@tab/styles/hud.css?inline"
import rawBannerCSS from "@tab/styles/banner.css?inline"

import type { NodeState, Outcome, OutboundMessage, Segment } from "@tab/types"
import { MIN_ACTIVE_MS_TO_REGISTER } from "@tab/types"

import { FloatingHUD }    from "@tab/ui/floating-hud"
import { BannerMarquee }  from "@tab/ui/banner-marquee"

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

// ─── Marquee double-content helper ────────────────────────────────────────────
// CSS @keyframes moves the element -50%, so we double the text to loop cleanly.

function prepareMarqueeText(el: HTMLElement, text: string): void {
  if (text.length > 60) {
    el.textContent = `${text}     ${text}`
  } else {
    el.textContent = text
  }
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

async function poll(tabId: number, hud: FloatingHUD): Promise<void> {
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
  } catch {}
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  if (!shouldInject()) return

  injectStyles("__tl2_hud_styles__",    rawHudCSS)
  injectStyles("__tl2_banner_styles__", rawBannerCSS)

  startLocalActiveClock()

  // ── HUD ────────────────────────────────────────────────────────────────────
  const hud = new FloatingHUD({
    onSegmentSelect: async (segment: Segment) => {
      const tabId = await resolveTabId()
      if (!tabId) return
      await sendMessage({ type: "SET_SEGMENT", tabId, segment })
      banner.setSegment(segment)
      await poll(tabId, hud)
    },

    onOutcomeRegister: async (outcome: Outcome) => {
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
        const resp = await sendMessage({ type: "REGISTER_SESSION", tabId, outcome })
        if (resp.type === "OK") {
          hud.onRegisterSuccess(outcome)
        } else if (resp.type === "ERR") {
          hud.onRegisterError(resp.message)
        }
      } catch (err) {
        hud.onRegisterError(err instanceof Error ? err.message : "Unknown error")
      }

      const tabId2 = await resolveTabId()
      if (tabId2) await poll(tabId2, hud)
    },
  })

  hud.mount(document.body)

  // ── Banner ─────────────────────────────────────────────────────────────────
  const banner = new BannerMarquee({
    toggleCombo: { key: "b", alt: true },
  })
  banner.mount(document.body)

  // Patch BannerMarquee to use the double-content helper on its textEl.
  // We do this externally so BannerMarquee stays unaware of the CSS trick.
  const origFetch = banner.fetchAndUpdate.bind(banner)
  banner.fetchAndUpdate = async () => {
    await origFetch()
    // After fetch, double the text content if long
    const textEl = document.querySelector<HTMLElement>(".__tl2_banner_text")
    if (textEl && textEl.textContent) {
      const raw = textEl.textContent.split("     ")[0] ?? textEl.textContent
      prepareMarqueeText(textEl, raw)
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const tabId = await resolveTabId()
  if (!tabId) return

  // Initial state
  await poll(tabId, hud)

  // Fetch banner text from server
  await banner.fetchAndUpdate()

  // Sync banner segment with node state
  const resp = await sendMessage({ type: "GET_NODE_STATE", tabId })
  if (resp.type === "NODE_STATE" && resp.state?.segment) {
    banner.setSegment(resp.state.segment)
  }

  // Poll every second
  setInterval(() => void poll(tabId, hud), 1000)

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
