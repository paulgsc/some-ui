import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  withPrepaintSuppressed,
} from "@filter/lib/content/prepaint"
import {
  applyTheme,
  repatchPage,
  restoreVendor,
} from "@filter/lib/content/theme-apply"
import { detect } from "@filter/lib/content/theme-detector"
import { DEFAULT_TAB_STATE, nextTabState } from "@filter/lib/tab-state"
import { ext } from "@filter/platform/content"
import type { FilterConfig } from "@filter/types/config"
import type { TabState } from "@filter/types/tab"
import { assertNever } from "@some-extension/common"

const DEFAULT_FILTER: FilterConfig = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

// ── State cache ───────────────────────────────────────────────────────────────
// sessionStorage is per-tab and persists across refreshes, letting legacy/off
// tabs restore their state synchronously without waiting for the background.

const STATE_CACHE_KEY = "__sw_tab_state"

function readCachedState(): TabState | null {
  try {
    // eslint-disable-next-line extension-charter/no-raw-storage
    const val = sessionStorage.getItem(STATE_CACHE_KEY)
    if (val === "auto" || val === "legacy" || val === "off") return val
  } catch {
    // Unavailable in some contexts (e.g. storage-restricted private browsing).
  }
  return null
}

function writeCachedState(state: TabState): void {
  try {
    // eslint-disable-next-line extension-charter/no-raw-storage
    sessionStorage.setItem(STATE_CACHE_KEY, state)
  } catch {
    // Ignore write failures.
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

let currentState: TabState = DEFAULT_TAB_STATE
let filterConfig: FilterConfig = DEFAULT_FILTER
let autoWasApplied = false

function applyState(state: TabState): void {
  currentState = state
  writeCachedState(state)

  restoreVendor()

  if (state === "auto") {
    // Do not pre-remove the veil here. runAutoTheme uses withPrepaintSuppressed
    // for snapshot isolation and handles veil teardown atomically after the
    // theme is committed (or restored).
    runAutoTheme()
    return
  }

  if (state === "legacy") {
    applyTheme("legacy", filterConfig)
    return
  }

  // off
  disablePrepaint()

  updateDebugAttrs()
}

function cycleState(): void {
  applyState(nextTabState(currentState))
}

// ── Auto theming (apply-then-detect) ────────────────────────────────────────────

function runAutoTheme(): void {
  // Apply-then-detect. The dark theme is the default; the detector only takes
  // it back off for pages that are already dark.
  //
  // Ordering note: our theme is injected with `!important`, so once it is in the
  // cascade getComputedStyle no longer reports vendor colors. The detector must
  // therefore snapshot the verdict from TRUE vendor styles first — which it can
  // do safely because the overlay veil (unlike the old restyle-in-place
  // prepaint) does not poison computed styles. We then apply the theme
  // unconditionally (default-on) and restore vendor only when the verdict says
  // the page was already dark.
  //
  // detect(), applyTheme(), and the optional restoreVendor() all run inside the
  // same suppression lock so the initial patch reads settled, non-transition-
  // interpolated colors and the veil teardown below is atomic.
  const { alreadyDark, avgLuminance } = withPrepaintSuppressed(() => {
    const verdict = detect()
    applyTheme("dark")
    if (verdict.alreadyDark) {
      restoreVendor()
    }
    return verdict
  })

  autoWasApplied = !alreadyDark

  if (autoWasApplied) {
    commitVisualState()
  } else {
    disablePrepaint()
  }

  document.body.dataset.swLuminance =
    avgLuminance !== null ? avgLuminance.toFixed(3) : "unknown"

  document.body.dataset.swThemeApplied = autoWasApplied ? "dark" : "none"

  updateDebugAttrs()
}

function updateDebugAttrs(): void {
  document.body.dataset.swTabState = currentState
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
  // Restore the last-known state synchronously from sessionStorage so that
  // legacy/off tabs can apply the correct visual state before the background
  // responds. For a cold background this avoids a 100–300 ms window of
  // un-filtered native page between veil drop and filter application.
  // Falls back to "auto" on the very first visit (no cache yet).
  const cached = readCachedState()
  if (cached !== null) currentState = cached

  applyState(currentState)

  // Fire background request in parallel; reconcile when it arrives.
  void (async (): Promise<void> => {
    try {
      const response = await ext.runtime.sendMessage({
        type: "GET_TAB_FILTER_STATE",
      })

      if (isGetTabFilterStateResponse(response)) {
        filterConfig = response.config

        if (response.enabled) {
          // Background confirms legacy — ensure we're there regardless of
          // cache, and repaint with the authoritative config even if the
          // cache already guessed "legacy": the synchronous cached paint
          // above ran before this response arrived, using whatever config
          // was in scope at that time (the module default, or a stale value
          // from a previous style). Skipping the repaint here left tabs
          // stuck on that stale look whenever the legacy style had changed
          // (e.g. dim <-> invert) since the last paint.
          if (currentState !== "legacy") {
            applyState("legacy")
          } else {
            applyTheme("legacy", filterConfig)
          }
        } else if (currentState === "legacy") {
          // Cache said legacy but this tab is no longer in the filter list
          // (user removed it via popup). Re-classify with auto.
          applyState("auto")
        }
      }
    } catch {
      // background unavailable — cached/auto decision stands
    }
  })()

  // SPA navigation re-patch: re-run the luminance patcher after pushState
  // navigations and YouTube's custom navigation event so newly rendered
  // subtrees are themed even when no new DOM nodes are added.
  // Note: third-party tab suspenders that replace the page with their own
  // origin URL are out-of-process and cannot be covered here; our re-
  // engagement on the real-URL reload is handled by the normal init path.
  //
  // We re-enable the veil before repatching so there is no frame where
  // newly rendered vendor elements are visible without the dark theme token.
  // commitVisualState() lifts the veil after two rAFs — by which point the
  // repatch tokens are already in the cascade.
  window.addEventListener("yt-navigate-finish", () => {
    if (autoWasApplied) {
      enablePrepaint()
      repatchPage()
      commitVisualState()
    }
  })
}

// ── Message listener ──────────────────────────────────────────────────────────

ext.runtime.onMessage.addListener((msg: unknown): void => {
  if (!isExtensionMessage(msg)) {
    return
  }

  const { type: t } = msg
  switch (t) {
    case "CYCLE_TAB_STATE": {
      cycleState()
      return
    }

    case "TOGGLE_FILTER": {
      // The background pushes this whenever the legacy style changes (e.g.
      // dim <-> invert) or this tab's filtered membership changes — the
      // config it carries is authoritative and must replace whatever this
      // tab last painted with, not just re-trigger a repaint of the old one.
      filterConfig = msg.config
      applyState(msg.enabled ? "legacy" : "auto")
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

    case "SET_LEGACY_STYLE": {
      // background-only message
      return
    }
    default: {
      t satisfies never
      assertNever(t)
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
