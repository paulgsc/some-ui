import {
  createDocumentScopeCustodian,
  type DocumentScopeCustodian,
} from "@filter/adapter/document-scope"
import {
  createContentSession,
  type ContentSession,
} from "@filter/adapter/pipeline"
import {
  createShadowScopeDiscovery,
  type ShadowScopeDiscovery,
} from "@filter/adapter/shadow-scope-discovery"
import { DEFAULT_SWATCH_ID, SWATCHES } from "@filter/adapter/swatches"
import {
  createCoverageRecorder,
  removeFromIndex,
  touchIndex,
  type CoverageRecorder,
} from "@filter/lib/content/coverage-observability"
import {
  createCoverageWatchdog,
  type CoverageWatchdog,
} from "@filter/lib/content/coverage-watchdog"
import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import {
  disablePrepaint,
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

// True between yt-navigate-start and yt-navigate-finish. Guards runAutoTheme's
// onFire below: the route swap's own DOM churn can go quiet for pipeline.ts's
// 50ms debounce before finish ever fires, letting the pipeline's own
// MutationObserver drive an onFire round on a still-mid-swap page and drop
// the veil yt-navigate-start just re-armed. Deferred, not dropped — finish's
// rescan() below runs its own synchronous onFire round with this false again.
let navigatingAway = false

// The content session's epoch source (Definition 5.4). Reset on every
// SPA-navigation re-patch (Theorem D.1(a)) — a full page reset (refresh)
// gets a fresh one for free, since this whole module re-initializes.
const sessionLifecycle = createSessionLifecycle()
let contentSession: ContentSession | null = null

// The document — rendering scope r_0 (Definition D.4) — as SF-RG's registry
// (#1265) sees it. Registered once, unconditionally, in init() below,
// before any tab-state decision runs: prepaint-start.js's veil already
// exists by the time this content script runs, so the registration is
// catching up to reality (Corollary D.1.1's day-zero case), not creating
// it. runAutoTheme()'s onFire routes decide/realize outcomes through it;
// yt-navigate-start and the coverage watchdog's repair call reengage() when
// they touch the physical veil directly — see document-scope.ts's own
// header for why legacy/off's own veil calls stay untouched regardless.
const documentScope: DocumentScopeCustodian = createDocumentScopeCustodian()

// Shadow-aware discovery + local custody (SF-DC, #1267): registers every
// open shadow root reachable from the document into the same registry
// `documentScope` uses, holding each under its own occlusion primitive
// (custody-primitive.ts's createOcclusionHold — a shadow scope has no
// pre-existing veil like the document's to reuse). Auto-mode-only, same
// scoping as documentScope itself: legacy's document-level filter already
// composites correctly across a shadow boundary (Gate 0's G0.7), and off
// mode has no custody to speak of. Started/torn down alongside
// contentSession in runAutoTheme()/applyState() below, not created fresh
// each time — the registry it shares with documentScope is long-lived for
// the life of this content script.
const shadowScopeDiscovery: ShadowScopeDiscovery = createShadowScopeDiscovery(
  documentScope.registry,
  () => sessionLifecycle.epoch
)

// `crypto.randomUUID()` requires a secure context; a content script runs in
// the page's own origin, so on plain http:// pages it is undefined and
// throws here — before bootInit()'s try/catch ever runs. getRandomValues()
// carries no such restriction, so build a v4 UUID from that instead.
function safeRandomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ── Coverage observability ───────────────────────────────────────────────────
//
// One recorder per content-script instance (see coverage-observability.ts's
// header for why: a shared cross-tab storage key would race). The watchdog
// re-reads the live DOM on every mutation that could touch the veil, the
// dark-theme attribute, or the legacy filter's attribute/<style> pair, and
// evaluates coverage-observability.ts's invariants against what it actually
// finds — not against what this module believes it last did.
const observabilitySessionId = safeRandomUUID()
const observabilityRecorder: CoverageRecorder = createCoverageRecorder(
  observabilitySessionId,
  true
)
const coverageWatchdog: CoverageWatchdog = createCoverageWatchdog(
  observabilityRecorder,
  () => currentState,
  // The watchdog's own dark-desync repair calls enablePrepaint() directly,
  // bypassing the registry the same way yt-navigate-start's own call does
  // (see that handler's comment). reengage() (not a cache-only reset — see
  // document-scope.ts's own header for the race a weaker version of this
  // left open) both re-asserts the veil and invalidates any resolveCommitted()
  // still in flight, so its eventual completion can't tear this repair's
  // veil back down.
  () => documentScope.reengage(sessionLifecycle.epoch)
)

function touchObservabilityIndex(): void {
  void touchIndex({
    sessionId: observabilitySessionId,
    origin: location.origin,
    title: document.title,
    tabState: currentState,
    updatedAt: Date.now(),
  })
}

function applyState(state: TabState): void {
  const previous = currentState
  currentState = state
  writeCachedState(state)
  observabilityRecorder.record({
    kind: "state.changed",
    detail: { from: previous, to: state },
  })
  touchObservabilityIndex()

  // The watchdog only needs to run while there is something to hold
  // coverage of — "off" is the one state Remark C.1's invariant does not
  // apply to (coverage-observability.ts's CoverageHeld already encodes
  // this), so tearing it down there is just avoiding dead observer
  // overhead, not a correctness requirement.
  if (state === "off") {
    coverageWatchdog.teardown()
  } else {
    coverageWatchdog.observe()
  }

  // Auto's pipeline owns its own MutationObserver — leaving auto (or
  // re-entering it) must stop the previous one before anything else runs,
  // or a stale session keeps reacting to mutations under the new mode.
  contentSession?.teardown()
  contentSession = null
  // Same for shadow-scope discovery: retires every currently-held shadow
  // scope (releasing its occlusion) and stops both its observers. Correct
  // to do unconditionally, not just when leaving auto — legacy/off do not
  // need shadow-scope custody at all (see this module's own header).
  shadowScopeDiscovery.teardown()

  restoreVendor()

  if (state === "auto") {
    // Do not pre-remove the veil here. runAutoTheme uses withPrepaintSuppressed
    // for snapshot isolation; the pipeline's onFire hook handles veil teardown
    // once the first decide/realize cycle actually settles.
    runAutoTheme()
    coverageWatchdog.check("apply-state:auto")
    return
  }

  if (state === "legacy") {
    applyTheme("legacy", filterConfig)
    coverageWatchdog.check("apply-state:legacy")
    return
  }

  // off
  disablePrepaint()
  coverageWatchdog.check("apply-state:off")

  updateDebugAttrs()
}

function cycleState(): void {
  applyState(nextTabState(currentState))
}

/**
 * Enter legacy mode, or — already there — just refresh the filter in place.
 *
 * `applyState("legacy")` is not a safe way to reassert an already-active
 * state: every call, redundant or not, runs `restoreVendor()` first, which
 * deletes `data-sw-legacy` and the `#__sw_legacy_filter` stylesheet outright
 * before `applyTheme` recreates them a statement later. That gap is real —
 * this project's coverage-watchdog exists precisely to catch a page sitting
 * in exactly that "declared legacy, filter rule gone" state — and unlike
 * every other path that opens it (a genuine mode transition, the first
 * paint), a *redundant* reassertion opens it with no veil up to cover the
 * page while it's open, because the veil was already torn down after the
 * settle this call is redundant with.
 *
 * The two call sites this guards both go redundant the same way: the
 * background doesn't track whether a tab already got the message it's about
 * to send. `TOGGLE_FILTER` is pushed on every `chrome.tabs.onUpdated`
 * "complete" transition for a tab already in `filteredTabIds` — and on
 * SPA-routed sites (YouTube's client-side router included) that status can
 * refire on an in-page navigation with no new document and no `nav-start`/
 * `nav-finish` pair, so the tab is already settled in legacy when the
 * message lands. The async init reconciliation below (`GET_TAB_FILTER_STATE`
 * racing the synchronous sessionStorage-cached paint) hits the identical
 * case any time both already agree on "legacy".
 *
 * Only an actual transition — auto/off into legacy — goes through
 * `applyState`, which is correct there: nothing exists yet to tear down.
 *
 * The "already legacy" branch itself only calls applyTheme() when `config`
 * actually differs from what's already applied — measured, not assumed: a
 * MutationObserver on document.documentElement showed applyLegacyFilter()'s
 * own `setAttribute(LEGACY_THEME_ATTR, "")` firing a real mutation record
 * even when the attribute already held that exact value (verified directly;
 * setAttribute has no built-in same-value short-circuit, unlike classList).
 * setStyleText() (theme-apply.ts) separately no-ops an identical textContent
 * write, but that guard is one step too late to catch this — the attribute
 * touch happens first, and it re-triggers every selector this extension has
 * gated on `[data-sw-legacy]` across two stylesheets (prepaint.css and this
 * one), on the same element that is also the root filter's own target. This
 * sandbox's headless/swiftshader e2e harness has not reproduced a visible
 * frame from that (a real, hardware-composited Chrome may, given a `filter`-
 * bearing root re-evaluating its own gated selectors is exactly the kind of
 * churn compositing layers are sensitive to) — checked here as a concrete,
 * measured no-op instead: zero DOM writes, not zero pixels.
 *
 * A redundant call with an identical config was unreachable before the
 * GET_TAB_FILTER_STATE fix (#1188) — its response was always `undefined`, so
 * this whole function only ever ran from the TOGGLE_FILTER path. Once that
 * response started arriving, EVERY page load's async init reconciliation
 * calls this a second time, moments after the synchronous cached paint
 * already applied the same config — and unlike a real config change, that
 * second call has nothing to accomplish.
 */
function enterOrRefreshLegacy(config: FilterConfig): void {
  const alreadyApplied =
    currentState === "legacy" && filterConfigsEqual(filterConfig, config)
  filterConfig = config
  if (currentState !== "legacy") {
    applyState("legacy")
  } else if (!alreadyApplied) {
    applyTheme("legacy", filterConfig)
  }
}

function filterConfigsEqual(a: FilterConfig, b: FilterConfig): boolean {
  return (
    a.invert === b.invert &&
    a.hueRotate === b.hueRotate &&
    a.sepia === b.sepia &&
    a.brightness === b.brightness &&
    a.contrast === b.contrast
  )
}

// ── Auto theming (apply-then-detect) ────────────────────────────────────────────

function runAutoTheme(): void {
  // Off/legacy mode's own direct disablePrepaint()/no-op veil handling can
  // leave the physical veil down (off) while the registry still believes a
  // prior HELD/RESOLVING/FAILED_HELD/COMMITTED/EXONERATED_NATIVE state —
  // a path this registry does not own (document-scope.ts's own header).
  // Re-engaging unconditionally before the first classification round below
  // closes that gap; it is a no-op DOM-wise on a cold entry into auto,
  // where nothing has released the hold yet.
  documentScope.reengage(sessionLifecycle.epoch)

  // Discover (and hold) every open shadow root already reachable from the
  // document before the first scan/decide/realize round runs — safe to do
  // unconditionally here: the document's own veil (documentScope.reengage()
  // above) is still up for the whole synchronous remainder of this call, so
  // there is no discovery-latency gap for the very first pass regardless of
  // ordering (Corollary D.1.1 covers it for free). observe() then starts
  // the reactive, non-debounced path (this module's own header — Corollary
  // D.3.1/G0.5 — explains why it cannot be folded into the pipeline's own
  // debounced coalescer).
  shadowScopeDiscovery.discover(document)
  shadowScopeDiscovery.observe()

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
  // documentScope.reportPipelineOutcome() runs on *every* fire, not just the
  // first: it re-derives whether anything actually changed (its own
  // signature guard, mirroring the idempotency commitVisualState()/
  // disablePrepaint() used to provide directly) and drives the registry's
  // custody transitions accordingly — including re-arming the veil around a
  // committed->exonerated (or exonerated->committed) re-classification, not
  // just tearing it down. The SPA re-patch path (yt-navigate-start re-shows
  // the veil, below; yt-navigate-finish's rescan() drives back into this
  // same callback) still reuses this same logic to lift it again.
  contentSession = createContentSession(
    SWATCHES[DEFAULT_SWATCH_ID],
    sessionLifecycle,
    (outcome) => {
      const applied =
        outcome.kind === "ok" &&
        outcome.actions.some((action) => action.kind === "activate-theme")
      document.body.dataset.swThemeApplied = applied ? "dark" : "none"
      updateDebugAttrs()

      if (navigatingAway) return

      documentScope.reportPipelineOutcome(outcome)
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
  // Exposed for the debug page's session picker and for e2e assertions —
  // the same role updateDebugAttrs()'s swTabState/swThemeApplied already
  // play, just for the observability session rather than the theme state.
  document.body.dataset.swObservabilitySession = observabilitySessionId

  documentScope.registerDocument(sessionLifecycle.epoch)

  observabilityRecorder.count("sessions_started")
  observabilityRecorder.record({ kind: "session.start" })

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
        if (response.enabled) {
          // enterOrRefreshLegacy() reads the module-level filterConfig
          // itself to decide whether this is a no-op, then assigns it — it
          // must run before filterConfig is touched here, or its comparison
          // is against a value this same reconciliation already overwrote
          // (config vs. itself, always "unchanged", even when the tab's
          // cached paint used a stale config and this response carries a
          // real change picked up while the tab sat idle).
          enterOrRefreshLegacy(response.config)
        } else {
          // Always the authoritative value, regardless of which branch below
          // runs (or whether either does) — cycleState() (the keyboard
          // shortcut's CYCLE_TAB_STATE handler) reads this module-level cache
          // directly with no config of its own, so an off/auto tab that skips
          // both branches here (background agrees it's off/auto, nothing to
          // reconcile) must still pick up e.g. a dim <-> invert style change
          // made while it sat idle — otherwise the next legacy entry repaints
          // with a stale filterConfig until some other message updates it.
          filterConfig = response.config

          if (currentState === "legacy") {
            // Cache said legacy but this tab is no longer in the filter list
            // (user removed it via popup). Re-classify with auto.
            applyState("auto")
          }
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
    observabilityRecorder.count("nav_starts")
    observabilityRecorder.record({ kind: "nav.start" })
    navigatingAway = true
    if (currentState === "off") return
    // reengage() both re-arms the veil (its own reRegister()'s hold.install()
    // is the same enablePrepaint() call this used to make directly) and
    // invalidates any resolveCommitted() still in flight from a round that
    // hadn't settled yet — a cache-only reset left that race open (see
    // document-scope.ts's own header).
    documentScope.reengage(sessionLifecycle.epoch)
    coverageWatchdog.check("nav-start")
  })

  window.addEventListener("yt-navigate-finish", () => {
    observabilityRecorder.count("nav_finishes")
    observabilityRecorder.record({ kind: "nav.finish" })
    navigatingAway = false

    if (currentState === "auto") {
      sessionLifecycle.resetContent()
      // Defense in depth alongside the reactive top-level observer already
      // running (shadowScopeDiscovery.observe(), started in runAutoTheme()
      // and never torn down across an SPA nav): a route swap that replaces
      // large parts of the document in one synchronous burst is exactly the
      // kind of change this discover() call catches deterministically,
      // rather than relying on the observer's own mutation batching alone.
      shadowScopeDiscovery.discover(document)
      contentSession?.rescan()
      coverageWatchdog.check("nav-finish:auto")
      return
    }

    if (currentState === "legacy") {
      applyTheme("legacy", filterConfig)
      coverageWatchdog.check("nav-finish:legacy")
      return
    }

    disablePrepaint()
    coverageWatchdog.check("nav-finish:off")
  })

  // Real navigation away (or the tab closing) — flush whatever this session
  // recorded and drop its index entry so the debug page's picker does not
  // accumulate dead sessions. Best-effort: pagehide is not guaranteed on
  // every teardown path (a killed process gets neither), but it is the best
  // signal available from a content script.
  window.addEventListener("pagehide", () => {
    coverageWatchdog.teardown()
    void observabilityRecorder.dispose()
    void removeFromIndex(observabilitySessionId)
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
      //
      // It also pushes this redundantly: background.ts's tabs.onUpdated
      // handler re-sends TOGGLE_FILTER{enabled:true} on every "complete"
      // transition for a tab already in filteredTabIds, with no check for
      // whether this tab is already in legacy mode. On an SPA whose router
      // re-fires that status without a real navigation, this message can
      // land well after the tab already settled into legacy — going through
      // applyState() here (unconditionally, every call) tore the filter
      // down and rebuilt it with no veil up to cover the gap. See
      // enterOrRefreshLegacy()'s own comment for the mechanism.
      if (msg.enabled) {
        enterOrRefreshLegacy(msg.config)
      } else {
        filterConfig = msg.config
        applyState("auto")
      }
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
