import {
  createContentSession,
  type ContentSession,
} from "@filter/adapter/pipeline"
import { DEFAULT_SWATCH_ID, SWATCHES } from "@filter/adapter/swatches"
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
import { applyTheme, restoreVendor } from "@filter/lib/content/theme-apply"
import { DEFAULT_TAB_STATE, nextTabState } from "@filter/lib/tab-state"
import { ext } from "@filter/platform/content"
import type { FilterConfig } from "@filter/types/config"
import type { TabState } from "@filter/types/tab"
import { assertNever } from "@some-extension/common"
import { createSessionLifecycle } from "@some-extension/transport/session/lifecycle"

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

// The content session's epoch source (Definition 5.4). Reset on every
// SPA-navigation re-patch (Theorem D.1(a)) — a full page reset (refresh)
// gets a fresh one for free, since this whole module re-initializes.
const sessionLifecycle = createSessionLifecycle()
let contentSession: ContentSession | null = null

function applyState(state: TabState): void {
  currentState = state
  writeCachedState(state)

  // Auto's pipeline owns its own MutationObserver — leaving auto (or
  // re-entering it) must stop the previous one before anything else runs,
  // or a stale session keeps reacting to mutations under the new mode.
  contentSession?.teardown()
  contentSession = null

  restoreVendor()

  if (state === "auto") {
    // Do not pre-remove the veil here. runAutoTheme uses withPrepaintSuppressed
    // for snapshot isolation; the pipeline's onFire hook handles veil teardown
    // once the first decide/realize cycle actually settles.
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
  // Apply-then-detect, now folded into decide() (S3): the pipeline scans
  // true vendor colors under the veil, feeds them to the Estimator, and
  // decide() itself withholds every per-surface action (emitting only
  // restore-native) when the page reads as already dark — the "apply
  // unconditionally, then restore" two-step is gone; decide() settles it
  // in one pure call.
  //
  // Ordering note: the veil (unlike the old restyle-in-place prepaint) does
  // not poison computed styles, so the Sensor's scan reads true vendor
  // colors with the veil still up. withPrepaintSuppressed freezes
  // transitions/animations around the *scan* only, so getComputedStyle
  // reads settled values. rescan() (below) settles decide/realize
  // synchronously within this same call — no timer in the way of the
  // initial verdict; only the MutationObserver's own burst-coalescing
  // (pipeline.ts's observe()) is debounced.
  //
  // commitVisualState()/disablePrepaint() run on *every* fire, not just the
  // first: both are idempotent no-ops once the veil is already down, and
  // re-running them unconditionally is what lets the SPA re-patch path
  // (yt-navigate-start re-shows the veil, below; yt-navigate-finish's
  // rescan() drives back into this same callback) reuse this same logic
  // to lift it again, instead of needing its own copy of it.
  contentSession = createContentSession(
    SWATCHES[DEFAULT_SWATCH_ID],
    sessionLifecycle,
    (actions) => {
      const applied = actions.some((action) => action.kind === "activate-theme")
      document.body.dataset.swThemeApplied = applied ? "dark" : "none"
      updateDebugAttrs()

      if (applied) {
        commitVisualState()
      } else {
        disablePrepaint()
      }
    }
  )

  withPrepaintSuppressed(() => {
    contentSession?.rescan()
  })
  contentSession.observe()
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

  // SPA navigation re-patch: YouTube's Polymer router swaps large portions
  // of the document — up to and including `<head>`/`<body>` themselves —
  // around its own `yt-navigate-*` events, independent of any pushState
  // the Sensor's own MutationObserver would otherwise see (Theorem
  // D.1(a) — same-document navigation, epoch advances). Note: third-party
  // tab suspenders that replace the page with their own origin URL are
  // out-of-process and cannot be covered here; our re-engagement on the
  // real-URL reload is handled by the normal init path.
  //
  // Two events, two jobs:
  //   - yt-navigate-start fires *before* the router tears down/rebuilds the
  //     outgoing route. Re-arming the veil here — unconditionally, for
  //     every non-"off" state — covers the swap itself. Reacting only on
  //     *finish* (the previous behavior) re-covers the page only after the
  //     native, unthemed swap has already painted for at least one frame:
  //     that can shorten a flash, never prevent it.
  //   - yt-navigate-finish fires once the swap has settled: auto re-scans
  //     (its onFire hook, registered above, decides whether to commit or
  //     release the veil); legacy re-applies its filter, since a
  //     head/body swap can carry off its <style> tag along with whatever
  //     it replaced.
  //
  // Previously this whole re-patch was gated on `autoWasApplied`, which is
  // only ever set from inside auto's own onFire callback — every
  // legacy-mode tab, and any auto-mode tab whose very first verdict was
  // "no theme needed", got no protection at all against this event for the
  // rest of the tab's life. Both handlers key off `currentState` directly
  // instead, so every mode is covered.
  window.addEventListener("yt-navigate-start", () => {
    if (currentState === "off") return
    enablePrepaint()
  })

  window.addEventListener("yt-navigate-finish", () => {
    if (currentState === "auto") {
      sessionLifecycle.resetContent()
      contentSession?.rescan()
      return
    }

    if (currentState === "legacy") {
      applyTheme("legacy", filterConfig)
      return
    }

    disablePrepaint()
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

function bootInit(): void {
  try {
    init()
  } catch (error) {
    // A throw in init() (a transport factory failing, restoreVendor or
    // withPrepaintSuppressed dying before the pipeline's onFire hook ever
    // runs) otherwise leaves the veil up forever with the failure visible
    // nowhere — the silent-hang class of bug that reads, from the outside, as
    // "the extension loads but never processes." Surface it on the console so
    // it is at least diagnosable rather than a mute stall.
    // eslint-disable-next-line no-console
    console.error("[some-filter] content init() threw:", error)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootInit, { once: true })
} else {
  bootInit()
}

export {}
