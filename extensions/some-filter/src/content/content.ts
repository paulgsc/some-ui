/**
 * content.ts — some-filter content script
 *
 * Responsibilities:
 *   1. Perform one-time body surgery (page layer / overlay root split)
 *   2. Classify page luminance
 *   3. Apply dark theme CSS to page layer (token-based, not filter-based)
 *   4. Handle legacy TOGGLE_FILTER messages for per-tab filter override
 *      (used by popup when user explicitly enables the invert filter)
 *   5. Listen for dark theme toggle messages
 *
 * Layer model:
 *   <body>
 *     <div id="__sw_page_layer">   ← vendor DOM (dark theme + optional filter here)
 *     <div id="__sw_overlay_root" data-my-ext>  ← extension UI (never touched)
 */

import { classifyPage } from "@filter/lib/content/classify"
import {
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
} from "@filter/lib/content/dark-theme"
import { ensureLayers, getPageLayer } from "@some-extension/common/lib/layers"

// ── Legacy filter support (popup per-tab override) ───────────────────────────
// These are kept for backward compat with the existing background.ts message
// protocol. When the user uses the popup to apply invert filter to specific tabs,
// this still works — but now it targets __sw_page_layer instead of html.

type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
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

function applyLegacyFilter(enabled: boolean, config: FilterConfig): void {
  let style = document.getElementById(LEGACY_FILTER_STYLE_ID)

  if (!enabled) {
    style?.remove()
    return
  }

  if (!style) {
    style = document.createElement("style")
    style.id = LEGACY_FILTER_STYLE_ID
    ;(document.head ?? document.documentElement).appendChild(style)
  }

  const filterStr = buildFilterString(config)
  // Target page layer only — never html/body directly
  style.textContent = `html { filter: ${filterStr} !important; }`
}

// ── Dark theme lifecycle ─────────────────────────────────────────────────────

function activateDarkTheme(): void {
  document.documentElement.setAttribute(DARK_THEME_ATTR, "")
  injectDarkTheme()
}

function deactivateDarkTheme(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  removeDarkTheme()
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  // Step 1: DOM surgery — must happen before anything else reads/writes body.
  // Safe if DOM is already split (idempotent).
  ensureLayers()

  // Step 2: Classify page and apply dark theme if warranted.
  // We defer one microtask to let the page paint its initial styles,
  // giving getComputedStyle more accurate values.
  setTimeout(() => {
    const { isLight, skip, avgLuminance } = classifyPage()

    if (!skip && isLight) {
      activateDarkTheme()
    }

    // Debug: expose classification result on page layer for devtools inspection
    const pageLayer = getPageLayer()
    pageLayer.dataset.swLuminance = avgLuminance?.toFixed(3) ?? "unknown"
    pageLayer.dataset.swThemeApplied = !skip && isLight ? "dark" : "none"
  }, 0)

  // Step 3: Fetch current filter state from background (legacy invert path)
  ;(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        type: "GET_TAB_FILTER_STATE",
      })) as { enabled: boolean; config: FilterConfig } | undefined

      if (response?.enabled) {
        applyLegacyFilter(true, response.config)
      }
    } catch {
      // Extension context may not be ready — silent fail
    }
  })()
}

// ── Message listener ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  const m = msg as { type: string; enabled?: boolean; config?: FilterConfig }

  // Legacy per-tab invert toggle (from popup apply button)
  if (m.type === "TOGGLE_FILTER") {
    applyLegacyFilter(m.enabled ?? false, m.config ?? {})
    if (m.enabled) {
      deactivateDarkTheme()
    } else {
      activateDarkTheme()
    }
  }

  // Dark theme toggle (for future background.ts integration)
  if (m.type === "SET_DARK_THEME") {
    if (m.enabled) {
      activateDarkTheme()
    } else {
      deactivateDarkTheme()
    }
  }
})

// ── Run ───────────────────────────────────────────────────────────────────────

// Run immediately if DOM is ready, otherwise wait for it.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true })
} else {
  init()
}

export {}
