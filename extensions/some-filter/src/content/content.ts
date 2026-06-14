import { classifyPage } from "@filter/lib/content/classify"
import {
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
} from "@filter/lib/content/dark-theme"
import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import {
  commitVisualState,
  disablePrepaint,
} from "@filter/lib/content/prepaint"
import type { FilterConfig } from "@filter/types/config"
import type { TabState } from "@filter/types/tab"

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

    const root = document.head
    root.appendChild(style)
  }

  style.textContent = `
    html { filter: ${buildFilterString(config)} !important; }
    img, video, canvas, picture {
      filter: invert(1) hue-rotate(180deg) !important;
    }
  `
}

function removeLegacyFilter(): void {
  document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
}

// ── Dark theme ───────────────────────────────────────────────────────────────

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

  if (state === "auto") {
    disablePrepaint()
    runAutoClassify()
    return
  }

  if (state === "legacy") {
    applyLegacyFilter(filterConfig)
    commitVisualState()
    return
  }

  // off
  disablePrepaint()

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

  autoWasApplied = Boolean(!skip && isLight)

  if (autoWasApplied) {
    commitVisualState()
    activateDarkTheme()
  } else {
    disablePrepaint()
  }

  document.body.dataset.swLuminance =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    avgLuminance !== undefined ? avgLuminance?.toFixed(3) : "unknown"

  document.body.dataset.swThemeApplied = autoWasApplied ? "dark" : "none"

  updateDebugAttrs()
}

function updateDebugAttrs(): void {
  document.body.dataset.swTabState = currentState
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
  const bootstrap = async (): Promise<void> => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "GET_TAB_FILTER_STATE",
      })

      if (isGetTabFilterStateResponse(response)) {
        filterConfig = response.config

        if (response.enabled) {
          currentState = "legacy"
        }
      }
    } catch {
      // background unavailable
    }

    applyState(currentState)
  }

  void bootstrap()
}

// ── Message listener ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg: unknown): void => {
  if (!isExtensionMessage(msg)) {
    return
  }

  switch (msg.type) {
    case "CYCLE_TAB_STATE": {
      cycleState()
      return
    }

    case "TOGGLE_FILTER": {
      applyState("legacy")
      return
    }

    case "SET_FILTERED_TABS": {
      // background-only message
      return
    }

    case "GET_TAB_FILTER_STATE": {
      // background request message
      return
    }
    default: {
      msg satisfies never
    }
  }
})

// ── Run ───────────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true })
} else {
  init()
}

export {}
