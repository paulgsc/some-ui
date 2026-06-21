import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import {
  commitVisualState,
  disablePrepaint,
  withPrepaintSuppressed,
} from "@filter/lib/content/prepaint"
import {
  applyTheme,
  repatchPage,
  restoreVendor,
} from "@filter/lib/content/theme-apply"
import { detect } from "@filter/lib/content/theme-detector"
import { ext } from "@filter/platform/content"
import type { FilterConfig } from "@filter/types/config"
import type { TabState } from "@filter/types/tab"

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
    const val = sessionStorage.getItem(STATE_CACHE_KEY)
    if (val === "auto" || val === "legacy" || val === "off") return val
  } catch {
    // Unavailable in some contexts (e.g. storage-restricted private browsing).
  }
  return null
}

function writeCachedState(state: TabState): void {
  try {
    sessionStorage.setItem(STATE_CACHE_KEY, state)
  } catch {
    // Ignore write failures.
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

let currentState: TabState = "auto"
let filterConfig: FilterConfig = DEFAULT_FILTER
let autoWasApplied = false

function applyState(state: TabState): void {
  currentState = state
  writeCachedState(state)

  restoreVendor()

  if (state === "auto") {
    // Do not pre-remove the veil here. runAutoClassify uses
    // withPrepaintSuppressed for snapshot isolation and handles veil
    // teardown atomically after theme injection.
    runAutoClassify()
    return
  }

  if (state === "legacy") {
    applyTheme("legacy", filterConfig)
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
  // detect() AND applyTheme("dark") (which internally patches the DOM) must
  // both run inside the same prepaint suppression lock. Extending the lock to
  // cover the initial patch ensures it reads native, non-transition-interpolated
  // colors — the same guarantee we give detect(). Without this, the patch would
  // run after the freeze style is removed and could catch mid-transition near-
  // zero alpha values, tagging light elements as `preserve` and permanently
  // exposing white after veil drop.
  const { alreadyDark, avgLuminance } = withPrepaintSuppressed(() => {
    const result = detect()
    if (!result.alreadyDark) {
      // Inject theme CSS + run initial patchAll inside the lock.
      // The dark substrate is in the cascade before withPrepaintSuppressed
      // returns, so veil removal (commitVisualState below) is already atomic.
      applyTheme("dark")
    }
    return result
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
          // Background confirms legacy — ensure we're there regardless of cache.
          if (currentState !== "legacy") applyState("legacy")
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
  // Run synchronously — yt-navigate-finish fires after YouTube's DOM is
  // settled, so calling repatchPage() immediately stays ahead of the next
  // frame paint. A microtask delay would yield the thread and risk a frame
  // where newly inserted nodes are unpatched.
  window.addEventListener("yt-navigate-finish", () => {
    if (autoWasApplied) repatchPage()
  })
}

// ── Message listener ──────────────────────────────────────────────────────────

ext.runtime.onMessage.addListener((msg: unknown): void => {
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
