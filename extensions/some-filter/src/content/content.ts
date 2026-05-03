/**
 *
 * Three tab states, cycled by keyboard shortcut (Ctrl+Shift+F):
 *
 *   "auto"    Default. Luminance classifier runs; dark theme applied if page is light.
 *
 *   "legacy"  Defeat mode. Aggressive invert filter on <html>.
 *             Used when auto dark theme fails badly on a particular page.
 *
 *   "off"     Zero filtering.
 *
 * State cycle: auto → legacy → off → auto → ...
 *
 * DOM surgery removed: vendor DOM is no longer wrapped in a container div.
 * Extension-owned nodes carry data-my-ext=""; the patcher and CSS rules
 * self-exclude on that attribute. See layers.ts for the updated contract.
 */

import { classifyPage } from "@filter/lib/content/classify"
import {
  DARK_THEME_ATTR,
  injectDarkTheme,
  PRE_FILTER_STYLE_ID,
  removeDarkTheme,
} from "@filter/lib/content/dark-theme"

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
}

type TabState = "auto" | "legacy" | "off"

// ── Legacy filter ─────────────────────────────────────────────────────────────

const DEFAULT_FILTER: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

const LEGACY_FILTER_STYLE_ID = "__sw_legacy_filter"

function buildFilterString(config: FilterConfig): string {
  const parts: Array<string> = []
  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined)
    parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined)
    parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)
  return parts.join(" ")
}

function applyLegacyFilter(config: FilterConfig): void {
  let style = document.getElementById(LEGACY_FILTER_STYLE_ID)
  if (!style) {
    style = document.createElement("style")
    style.id = LEGACY_FILTER_STYLE_ID
    ;(document.head ?? document.documentElement).appendChild(style)
  }
  style.textContent = `
    html { filter: ${buildFilterString(config)} !important; }
    img, video, canvas, picture { filter: invert(1) hue-rotate(180deg) !important; }
  `
}

function removeLegacyFilter(): void {
  document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
}

// ── Auto dark theme ───────────────────────────────────────────────────────────

function activateDarkTheme(): void {
  document.documentElement.setAttribute(DARK_THEME_ATTR, "")
  injectDarkTheme()
}

function deactivateDarkTheme(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  removeDarkTheme()
}

// ── State machine ─────────────────────────────────────────────────────────────

let currentState: TabState = "auto"
let filterConfig: FilterConfig = DEFAULT_FILTER
let autoWasApplied = false

function applyState(state: TabState): void {
  currentState = state

  deactivateDarkTheme()
  removeLegacyFilter()

  switch (state) {
    case "auto":
      runAutoClassify()
      break
    case "legacy":
      // Pre-filter style is no longer needed once legacy takes over
      document.getElementById(PRE_FILTER_STYLE_ID)?.remove()
      applyLegacyFilter(filterConfig)
      break
    case "off":
      // Both already cleared; also remove the pre-filter if still present
      document.getElementById(PRE_FILTER_STYLE_ID)?.remove()
      break
  }

  updateDebugAttrs()
}

function cycleState(): void {
  const next: Record<TabState, TabState> = {
    auto: "legacy",
    legacy: "off",
    off: "auto",
  }
  applyState(next[currentState])
}

// ── Classification ────────────────────────────────────────────────────────────

function runAutoClassify(): void {
  const { isLight, skip, avgLuminance } = classifyPage()
  autoWasApplied = !skip && isLight

  if (autoWasApplied) {
    activateDarkTheme()
  } else {
    // Page is already dark or classification skipped — remove pre-filter
    document.getElementById(PRE_FILTER_STYLE_ID)?.remove()
  }

  // Debug attrs on body (no page layer div anymore)
  document.body.dataset.swLuminance = avgLuminance?.toFixed(3) ?? "unknown"
  document.body.dataset.swThemeApplied = autoWasApplied ? "dark" : "none"
}

function updateDebugAttrs(): void {
  document.body.dataset.swTabState = currentState
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
  // No DOM surgery. Vendor DOM is untouched.
  // Extension nodes self-exclude via data-my-ext.

  ;(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        type: "GET_TAB_FILTER_STATE",
      })) as
        | { enabled: boolean; config: FilterConfig; tabState?: TabState }
        | undefined

      if (response?.config) {
        filterConfig = response.config
      }

      if (response?.enabled) {
        currentState = "legacy"
      }
    } catch {
      // Background not ready — proceed with defaults
    }

    setTimeout(() => {
      applyState(currentState)
    }, 0)
  })()
}

// ── Message listener ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  const m = msg as {
    type: string
    enabled?: boolean
    config?: FilterConfig
    tabState?: TabState
  }

  if (m.type === "CYCLE_TAB_STATE") {
    cycleState()
    return
  }

  if (m.type === "TOGGLE_FILTER") {
    if (m.config) filterConfig = m.config
    applyState(m.enabled ? "legacy" : "auto")
    return
  }

  if (m.type === "SET_DARK_THEME") {
    applyState(m.enabled ? "auto" : "off")
    return
  }
})

// ── Run ───────────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true })
} else {
  init()
}

export {}
