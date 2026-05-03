
/**
 * content.ts — some-filter content script
 *
 * Three tab states, cycled by keyboard shortcut (Ctrl+Shift+F):
 *
 *   "auto"    Default. Luminance classifier runs; dark theme applied if page is light.
 *             This is the normal operating mode.
 *
 *   "legacy"  Defeat mode. Aggressive invert filter on <html> (not page layer).
 *             Used when auto dark theme fails badly on a particular page.
 *             User explicitly chose this — we target html because we want maximum
 *             coverage and we're admitting the DOM structure defeated us.
 *
 *   "off"     Zero filtering. No dark theme, no legacy filter.
 *             For pages that are already well-designed dark, or pages where
 *             both modes cause problems (e.g. video-heavy pages).
 *
 * State cycle: auto → legacy → off → auto → ...
 *
 * Auto dark theme and legacy filter are fully orthogonal:
 *   - Auto dark theme: CSS token overrides + JS luminance patcher
 *   - Legacy filter: CSS filter on <html>
 *   - They never both apply simultaneously
 */

import { classifyPage } from "@filter/lib/content/classify" 
import {   DARK_THEME_ATTR,   injectDarkTheme,   removeDarkTheme, } from "@filter/lib/content/dark-theme" 
import { ensureLayers, getPageLayer } from "@some-extension/common/lib/layers"

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
}

type TabState = "auto" | "legacy" | "off"

// ── Legacy filter (defeat mode) ───────────────────────────────────────────────
// Targets <html> directly — maximum coverage, no structural surgery.
// This is intentional: in legacy mode we're applying brute force.

const DEFAULT_FILTER: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

const LEGACY_FILTER_STYLE_ID = "__sw_legacy_filter"

function buildFilterString(config: FilterConfig): string {
  const parts: string[] = []
  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined) parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined) parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)
  return parts.join(" ")
}

function applyLegacyFilter(config: FilterConfig): void {
  let style = document.getElementById(LEGACY_FILTER_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = LEGACY_FILTER_STYLE_ID
    ;(document.head ?? document.documentElement).appendChild(style)
  }
  // Target <html> in legacy mode — this is the intentional choice for defeat mode.
  // Unlike auto mode, we want maximum surface area coverage here.
  style.textContent = `
    html { filter: ${buildFilterString(config)} !important; }
    /* Protect media from inversion */
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
let autoWasApplied = false // track whether auto actually ran the theme

function applyState(state: TabState): void {
  currentState = state

  // Always clear both before applying new state — they are orthogonal
  deactivateDarkTheme()
  removeLegacyFilter()

  switch (state) {
    case "auto":
      // Re-run classification and apply dark theme if warranted
      runAutoClassify()
      break

    case "legacy":
      // Brute-force filter on <html>, orthogonal to auto dark theme
      applyLegacyFilter(filterConfig)
      break

    case "off":
      // Nothing — both already cleared above
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

// ── Classification + auto dark theme ─────────────────────────────────────────

function runAutoClassify(): void {
  const { isLight, skip, avgLuminance } = classifyPage()
  autoWasApplied = !skip && isLight

  if (autoWasApplied) {
    activateDarkTheme()
  }

  const pageLayer = getPageLayer()
  pageLayer.dataset.swLuminance = avgLuminance?.toFixed(3) ?? "unknown"
  pageLayer.dataset.swThemeApplied = autoWasApplied ? "dark" : "none"
}

function updateDebugAttrs(): void {
  const pageLayer = document.getElementById("__sw_page_layer")
  if (pageLayer) {
    pageLayer.dataset.swTabState = currentState
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
  // Step 1: DOM surgery — idempotent
  ensureLayers()

  // Step 2: Fetch stored filter state and config from background
  ;(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        type: "GET_TAB_FILTER_STATE",
      })) as { enabled: boolean; config: FilterConfig; tabState?: TabState } | undefined

      if (response?.config) {
        filterConfig = response.config
      }

      // If background says this tab had legacy filter active, restore that state
      if (response?.enabled) {
        currentState = "legacy"
      }
    } catch {
      // Not yet ready — proceed with defaults
    }

    // Step 3: Defer auto classify one tick to let page paint initial styles
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

  // Background sends TOGGLE_FILTER when keyboard shortcut fires
  // In new model, shortcut cycles state — background coordinates
  if (m.type === "CYCLE_TAB_STATE") {
    cycleState()
    return
  }

  // Legacy compat: popup Apply button still sends SET_FILTERED_TABS via background,
  // which then sends TOGGLE_FILTER to content. Map to legacy state.
  if (m.type === "TOGGLE_FILTER") {
    if (m.config) filterConfig = m.config
    if (m.enabled) {
      applyState("legacy")
    } else {
      applyState("auto")
    }
    return
  }

  // Direct dark theme control (future popup integration)
  if (m.type === "SET_DARK_THEME") {
    if (m.enabled) {
      applyState("auto")
    } else {
      applyState("off")
    }
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
