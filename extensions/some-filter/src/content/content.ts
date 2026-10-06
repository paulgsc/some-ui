import {
  createDocumentScopeCustodian,
  type DocumentExonerationProof,
  type DocumentRevision,
  type DocumentScopeCustodian,
} from "@filter/adapter/document-scope"
import {
  clearRealizedColorState,
  createContentSession,
  type ContentSession,
} from "@filter/adapter/pipeline"
import {
  createScopeRegistry,
  type ScopeId,
} from "@filter/adapter/scope-registry"
import {
  createShadowScopeDiscovery,
  type ShadowScopeDiscovery,
} from "@filter/adapter/shadow-scope-discovery"
import {
  createShadowScopeTheming,
  type ShadowScopeTheming,
} from "@filter/adapter/shadow-scope-theming"
import { DEFAULT_SWATCH_ID, SWATCHES } from "@filter/adapter/swatches"
import {
  mergeContrastAudits,
  type ContrastSourceReport,
} from "@filter/lib/content/contrast-observability"
import {
  createCoverageRecorder,
  removeFromIndex,
  touchIndex,
  type CoverageRecorder,
} from "@filter/lib/content/coverage-observability"
import {
  createCoverageWatchdog,
  createScopeCoverageWatchdog,
  type CoverageWatchdog,
  type ScopeCoverageWatchdog,
} from "@filter/lib/content/coverage-watchdog"
import { createDocumentEnforcementDeps } from "@filter/lib/content/enforcement-dom"
import {
  createEnforcementQueue,
  sheetPresent,
  type EnforcementDeps,
} from "@filter/lib/content/enforcement-handshake"
import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import {
  disablePrepaint,
  enablePrepaint,
  withPrepaintSuppressed,
} from "@filter/lib/content/prepaint"
import { applyTheme, restoreVendor } from "@filter/lib/content/theme-apply"
import { createVisibilityGate } from "@filter/lib/content/visibility-gate"
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

/**
 * True for the synchronous window inside applyState between
 * `currentState = state` and that state's actuation completing.
 * `coverageWatchdog.observe()` runs inside it, checking the new state against
 * the old DOM. See `CoverageContext.transitioning` for why that needs a
 * diagnostic flag rather than a timing fix.
 */
let transitioning = false

// True between yt-navigate-start and yt-navigate-finish. Guards runAutoTheme's
// onFire: the route swap's DOM churn can go quiet for the pipeline's 50ms
// debounce before finish fires, and an onFire round on a mid-swap page would
// drop the veil nav-start just re-armed. Deferred, not dropped: finish's
// rescan() runs its own synchronous onFire round.
let navigatingAway = false

/**
 * Set when the interaction-settled shadow pass is skipped because a
 * navigation is in flight; replayed by `yt-navigate-finish`.
 */
let deferredShadowContrast = false

// ── Enforcement sheet ──────────────────────────────────────────────────────
//
// Behind `enforcementSheetEnabled` (storage.local, default off). When on,
// auto mode is the sheet, not the classifier: runAutoTheme() requests the
// sheet, confirms it by reading the cascade, and releases the veil through
// the document scope's custody, starting none of the classifier's machinery.
// Either engine, never both, in one tab: the sheet's erase rule overrides
// shadow-scope theming, and the classifier's scan would read erased colours.
// See `lib/content/enforcement-handshake.ts`.

const ENFORCEMENT_FLAG_KEY = "enforcementSheetEnabled"

/** True while this tab is in auto with the flag on: the sheet decides. */
let enforcing = false
/**
 * True from this document's first ENSURE request until a removal read shows
 * the sheet gone. Set on *send*, not on confirm: a request that outlives its
 * liveness bound can still land afterwards, and leaving auto must then still
 * take it out, or legacy's invert would composite under the canvas rule's
 * `filter: none`.
 */
let enforcementMayBePresent = false
/** Bumped by every applyState(); async enforcement steps that see it change stand down. */
let stateGeneration = 0

const enforcementDeps: EnforcementDeps = createDocumentEnforcementDeps(
  (request) => ext.runtime.sendMessage(request)
)
/** Every ensure and removal for this document, strictly in call order — see createEnforcementQueue(). */
const enforcementQueue = createEnforcementQueue(
  enforcementDeps,
  DEFAULT_SWATCH_ID
)

async function readEnforcementFlag(): Promise<boolean> {
  try {
    const data = await ext.storage.local.get([ENFORCEMENT_FLAG_KEY])
    return data[ENFORCEMENT_FLAG_KEY] === true
  } catch {
    return false
  }
}

// The content session's epoch source (Definition 5.4). Reset on every
// SPA-navigation re-patch (Theorem D.1(a)); a refresh re-initializes the
// whole module.
const sessionLifecycle = createSessionLifecycle()
let contentSession: ContentSession | null = null

// `crypto.randomUUID()` requires a secure context, so on plain http:// pages
// it is undefined and would throw before bootInit()'s try/catch runs.
// getRandomValues() has no such restriction.
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
// header). The watchdog re-reads the live DOM on every mutation that could
// touch the veil, the dark-theme attribute, or the legacy filter, and checks
// the invariants against what it finds, not against what this module last did.
//
// Constructed before the scope registry: `registryObserver` is a
// construction-time parameter of `createScopeRegistry()`.
const observabilitySessionId = safeRandomUUID()
const observabilityRecorder: CoverageRecorder = createCoverageRecorder(
  observabilitySessionId,
  true
)

// The contrastHealth axis (see contrast-observability.ts's header). Two
// sources feed the one "contrast" snapshot: the document (the pipeline's
// runContrastChannel) and every live shadow scope (projectContrast), since
// auditLegibility's TreeWalker does not cross a shadow boundary. Each source's
// last report is kept here and merged with mergeContrastAudits(), which
// dedupes by (foreground, backdrop) pair. A source reports `null`, not `[]`,
// when its audit failed to complete (see ContrastSourceReport).
let documentContrast: ContrastSourceReport = []
const shadowContrastByScope = new Map<ScopeId, ContrastSourceReport>()

function recomputeContrastSnapshot(): void {
  observabilityRecorder.setSnapshot(
    "contrast",
    mergeContrastAudits(
      [documentContrast, ...shadowContrastByScope.values()],
      Date.now()
    )
  )
}

// Coverage over every live scope, not just the document — see
// coverage-watchdog.ts's header for why it is a second watchdog. Its hooks
// are wired into the registry and discovery at construction below; its
// observe()/teardown() follow shadowScopeDiscovery's auto-only lifecycle.
const scopeCoverageWatchdog: ScopeCoverageWatchdog<
  DocumentRevision,
  DocumentExonerationProof
> = createScopeCoverageWatchdog(observabilityRecorder)

// The scope registry shared by the document scope and every shadow scope,
// constructed here so the watchdog's observer is attached before any scope
// registers. The wrapper also evicts a shadow scope's stale contrast audit:
// nothing else would, so it would leak and keep ContrastHeld violated over a
// scope no longer themed or live.
const scopeRegistry = createScopeRegistry<
  DocumentRevision,
  DocumentExonerationProof
>({
  onTransition(id, event, to) {
    scopeCoverageWatchdog.registryObserver.onTransition?.(id, event, to)
    // Evict on every event that leaves the last audit meaningless. A fresh
    // commit is excluded (projectContrast just populated the entry), as are
    // the "still resolving" transitions, which change no realization.
    switch (event.kind) {
      case "retire":
      case "resolve-exonerated":
      case "resolve-failed":
      case "invalidate":
      case "re-register": {
        if (shadowContrastByScope.delete(id)) recomputeContrastSnapshot()
        return
      }
      case "register":
      case "resolve-committed":
      case "start-resolving":
      case "retry": {
        return
      }
      default: {
        const exhaustive: never = event
        throw new Error(
          `[content] unhandled scope event: ${JSON.stringify(exhaustive)}`
        )
      }
    }
  },
  onStaleResolveDiscarded(id) {
    scopeCoverageWatchdog.registryObserver.onStaleResolveDiscarded?.(id)
  },
})

// The document — rendering scope r_0 (Definition D.4). Registered once in
// init(), before any tab-state decision: prepaint-start.js's veil already
// exists, so registration catches up to reality (Corollary D.1.1's day-zero
// case). See document-scope.ts's header for which veil calls go through it.
const documentScope: DocumentScopeCustodian =
  createDocumentScopeCustodian(scopeRegistry)

// Projects the dark adapter into each discovered shadow scope, driven by
// shadowScopeDiscovery's onScopeReady hook. Module-scope: there is one
// selectable swatch, so nothing per-call would need it recreated.
const shadowScopeTheming: ShadowScopeTheming = createShadowScopeTheming(
  documentScope.registry,
  () => SWATCHES[DEFAULT_SWATCH_ID],
  () => sessionLifecycle.epoch,
  // The shadow half of the merged "contrast" snapshot (see above).
  (id, audit) => {
    shadowContrastByScope.set(id, audit)
    recomputeContrastSnapshot()
  }
)

// Registers every open shadow root into the registry `documentScope` uses,
// holding each under its own occlusion primitive. Auto-mode only: legacy's
// document-level filter composites across a shadow boundary (Gate 0's G0.7),
// and off has no custody. Long-lived; started and torn down alongside
// contentSession.
const shadowScopeDiscovery: ShadowScopeDiscovery = createShadowScopeDiscovery(
  documentScope.registry,
  () => sessionLifecycle.epoch,
  (id) => shadowScopeTheming.project(id),
  (id, method) => scopeCoverageWatchdog.onDiscovered(id, method)
)

const coverageWatchdog: CoverageWatchdog = createCoverageWatchdog(
  observabilityRecorder,
  () => currentState,
  () => transitioning,
  // The dark-desync repair. reengage() re-asserts the veil and also
  // invalidates any resolveCommitted() in flight, so its completion can't
  // tear this repair's veil back down (document-scope.ts's header).
  () => documentScope.reengage(sessionLifecycle.epoch),
  () => (enforcing && currentState === "auto" ? DEFAULT_SWATCH_ID : null)
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

/** Defers auto mode's first round while the tab is hidden — see `visibility-gate.ts`. */
const visibilityGate = createVisibilityGate()

function applyState(state: TabState): void {
  const previous = currentState
  currentState = state
  stateGeneration++
  // runAutoTheme() re-derives this from the flag for an auto entry.
  enforcing = false
  writeCachedState(state)
  observabilityRecorder.record({
    kind: "state.changed",
    detail: { from: previous, to: state },
  })
  touchObservabilityIndex()

  // Set before coverageWatchdog.observe(): its first call after "off" checks
  // synchronously against a DOM actuation hasn't touched yet. The try/finally
  // below covers every teardown call too, since shadowScopeDiscovery.teardown()
  // can throw (an unguarded CSSOM uninstall) and nothing else resets the
  // flag. The post-actuation check still runs on a throw, which is then
  // re-thrown to the caller.
  transitioning = true
  // Both contrast sources are stale the moment currentState changes, even if
  // teardown below throws. Cleared before runAutoTheme(), whose rescan()
  // reports this round's fresh audit synchronously.
  if (
    documentContrast === null ||
    documentContrast.length > 0 ||
    shadowContrastByScope.size > 0
  ) {
    documentContrast = []
    shadowContrastByScope.clear()
    recomputeContrastSnapshot()
  }
  let actuationError: unknown
  try {
    // "off" is the one state CoverageHeld does not apply to; tearing down
    // there only avoids dead observer overhead.
    if (state === "off") {
      coverageWatchdog.teardown()
    } else {
      coverageWatchdog.observe()
    }

    // Stop the previous session's MutationObserver before anything else
    // runs, or it keeps reacting under the new mode.
    contentSession?.teardown()
    contentSession = null
    // Retires every held shadow scope and stops its observers;
    // legacy/off need no shadow-scope custody.
    shadowScopeDiscovery.teardown()
    shadowScopeTheming.teardown()
    // One last check() publishes the registry's post-purge state before
    // teardown() stops the poll; otherwise the "scopes" snapshot keeps showing
    // purged scopes. Only after auto: otherwise r_0's registry entry is stale
    // (restoreVendor() already stripped it) and the check would record a
    // permanent false scope.coverage_violated.
    if (previous === "auto") {
      scopeCoverageWatchdog.check(
        documentScope.registry,
        "apply-state:teardown"
      )
    }
    scopeCoverageWatchdog.teardown()

    restoreVendor()
    // restoreVendor() only knows the pre-adapter layers; see
    // clearRealizedColorState for the rest.
    clearRealizedColorState()
    // Only auto's nav-finish handler replays a deferral; one pending across a
    // mode change has nothing left to replay it.
    deferredShadowContrast = false

    // A pending deferral belongs to the state we are leaving.
    visibilityGate.cancel()

    if (state === "auto") {
      // Do not pre-remove the veil: the pipeline's onFire hook drops it once
      // the first decide/realize cycle settles.
      visibilityGate.whenVisible(runAutoTheme)
    } else if (enforcementMayBePresent) {
      // Leaving an enforced auto: remove the sheet under a re-armed veil,
      // and only then apply legacy (or drop the veil for off). The canvas
      // rule's `filter: none` would override legacy's invert.
      enablePrepaint()
      void leaveEnforcement(state, stateGeneration)
    } else if (state === "legacy") {
      applyTheme("legacy", filterConfig)
    } else {
      disablePrepaint()
    }
  } catch (error) {
    actuationError = error
  } finally {
    transitioning = false
  }

  if (state === "auto") {
    coverageWatchdog.check("apply-state:auto")
    scopeCoverageWatchdog.check(documentScope.registry, "apply-state:auto")
  } else if (state === "legacy") {
    coverageWatchdog.check("apply-state:legacy")
  } else {
    coverageWatchdog.check("apply-state:off")
    updateDebugAttrs()
  }

  if (actuationError !== undefined) throw actuationError
}

async function leaveEnforcement(
  state: TabState,
  generation: number
): Promise<void> {
  const removed = await enforcementQueue.remove()
  // A re-entry into auto has already queued a fresh request behind this removal.
  if (removed && generation === stateGeneration) {
    enforcementMayBePresent = false
  }
  observabilityRecorder.record({
    kind: "enforcement.removed",
    detail: { confirmed: removed },
  })
  // A later applyState() owns the tab now.
  if (generation !== stateGeneration) return
  updateDebugAttrs()
  if (state === "legacy") {
    applyTheme("legacy", filterConfig)
    coverageWatchdog.check("enforcement-removed:legacy")
  } else {
    disablePrepaint()
    coverageWatchdog.check("enforcement-removed:off")
  }
}

function cycleState(): void {
  applyState(nextTabState(currentState))
}

/**
 * Enter legacy mode, or — already there — just refresh the filter in place.
 *
 * `applyState("legacy")` is not safe for reasserting an active state: it runs
 * `restoreVendor()` first, deleting the legacy attribute and stylesheet
 * before `applyTheme` recreates them, and a redundant call has no veil up to
 * cover that gap. Both callers go redundant: the background re-sends
 * `TOGGLE_FILTER` on every tabs.onUpdated "complete" (which SPA routers refire
 * without a new document), and init's `GET_TAB_FILTER_STATE` reconciliation
 * usually agrees with the cached paint.
 *
 * The "already legacy" branch skips applyTheme() when `config` is unchanged:
 * `setAttribute` fires a mutation even for an identical value, re-triggering
 * every `[data-sw-legacy]`-gated selector on the root filter's own target.
 * Zero DOM writes, measured.
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
  // Off mode can leave the physical veil down while the registry still
  // believes a prior state (a path it does not own). Re-engaging first closes
  // that gap; it is a DOM no-op on a cold entry into auto.
  documentScope.reengage(sessionLifecycle.epoch)

  // Which engine owns this tab: one storage read under the veil; a later
  // applyState() supersedes this entry while it is pending.
  const generation = stateGeneration
  void readEnforcementFlag().then((flag) => {
    if (generation !== stateGeneration || currentState !== "auto") return
    try {
      if (flag) {
        enforcing = true
        void runEnforcementRound(generation)
      } else {
        runClassifier()
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[some-filter] auto mode failed to start:", error)
    }
  })
}

/**
 * One ensure/confirm/release round for the enforcement sheet. The caller has
 * the veil up (or knows the sheet may be missing); this releases it through
 * the document scope's custody on a confirm read, and onto the native page on
 * the liveness timeout.
 */
async function runEnforcementRound(generation: number): Promise<void> {
  enforcementMayBePresent = true
  const outcome = await enforcementQueue.ensure(
    () => generation === stateGeneration && currentState === "auto"
  )
  if (
    outcome.kind === "superseded" ||
    generation !== stateGeneration ||
    currentState !== "auto"
  ) {
    return
  }

  updateDebugAttrs()
  if (outcome.kind === "confirmed") {
    document.body.dataset.swThemeApplied = "enforced"
    observabilityRecorder.record({
      kind: "enforcement.confirmed",
      detail: { sent: outcome.sent },
    })
    documentScope.reportEnforcement({
      kind: "confirmed",
      swatchId: DEFAULT_SWATCH_ID,
    })
  } else {
    document.body.dataset.swThemeApplied = "none"
    observabilityRecorder.count("enforcement_timeout")
    observabilityRecorder.record({
      kind: "enforcement.timeout",
      detail: { sent: outcome.sent },
    })
    documentScope.reportEnforcement({ kind: "timeout" })
    retryEnforcementWhenVisible(generation)
  }
  coverageWatchdog.check("enforcement")
}

/**
 * The one retry the liveness path keeps: the next time the tab becomes
 * visible, re-raise the veil and run the round again. One-shot, and dropped
 * if the tab's state has moved on by then.
 */
function retryEnforcementWhenVisible(generation: number): void {
  const onVisible = (): void => {
    if (document.visibilityState !== "visible") return
    document.removeEventListener("visibilitychange", onVisible)
    if (generation !== stateGeneration || !enforcing) return
    documentScope.reengage(sessionLifecycle.epoch)
    void runEnforcementRound(generation)
  }
  document.addEventListener("visibilitychange", onVisible)
}

/** True while this tab is enforcing and the sheet reads as present. */
function enforcedAndPresent(): boolean {
  return (
    enforcing &&
    currentState === "auto" &&
    sheetPresent(enforcementDeps, DEFAULT_SWATCH_ID)
  )
}

function runClassifier(): void {
  // Discover every reachable open shadow root before the first round. The
  // document's veil is still up for the rest of this call, so there is no
  // discovery-latency gap (Corollary D.1.1). observe() starts the reactive,
  // non-debounced path (Corollary D.3.1/G0.5).
  shadowScopeDiscovery.discover(document)
  shadowScopeDiscovery.observe()
  // Started before shadowScopeTheming.observe(), deliberately: both poll
  // every 250ms, and same-period intervals fire in registration order. The
  // diagnostic poll must see a vendor's wholesale adoptedStyleSheets
  // reassignment before the self-heal below erases the evidence.
  scopeCoverageWatchdog.observe(documentScope.registry)
  // Integrity poll: repairs a committed shadow scope whose
  // adoptedStyleSheets a vendor reassignment dropped, a CSSOM write no
  // MutationObserver can see.
  shadowScopeTheming.observe()

  // Apply-then-detect lives in decide(): the scan reads true vendor colours
  // under the veil (which does not poison computed styles), and decide()
  // emits only restore-native when the page already reads dark.
  // withPrepaintSuppressed freezes transitions around the scan only. rescan()
  // settles decide/realize synchronously; only the MutationObserver path is
  // debounced.
  //
  // reportPipelineOutcome() runs on every fire: its own signature guard
  // decides whether anything changed and drives the custody transitions,
  // including re-arming the veil around a re-classification. The SPA
  // re-patch path reaches this same callback through nav-finish's rescan().
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

      // A shadow carrier with transparent ancestors resolves its backdrop
      // into the light DOM, onto an element this round may have just
      // darkened. Scopes project before this debounced round, and nothing
      // re-audits them afterwards, so re-contrast here, after realize().
      //
      // Gated on the actuator having written. The action list is the wrong
      // signal (a newly tagged element under an existing rule changes no
      // action), and every round is too often: the scan does not enter
      // shadow trees, so this walk is extra work. `restore-native` counts as
      // a write too.
      if (outcome.kind === "ok" && outcome.realizationChanged) {
        shadowScopeTheming.recontrastAll()
      }

      documentScope.reportPipelineOutcome(outcome)
    },
    // The pipeline's interaction-settled contrast pass covers the light DOM
    // only, so a `:hover`/`:focus` swap inside or under a shadow carrier
    // needs this. An interaction produces no write, so onFire never sees it.
    () => {
      // Skipped mid-navigation (the backdrop is being replaced) and recorded
      // for replay at nav-finish. The replay is a guarantee: today's
      // navigations always write, so onFire re-contrasts anyway, but
      // `discover()` does not re-project a surviving root, so a zero-write
      // navigation would otherwise strand the scope. Costs one boolean.
      if (navigatingAway) {
        deferredShadowContrast = true
        return
      }
      shadowScopeTheming.recontrastAll()
    },
    // The document half of the merged "contrast" snapshot; never folded into
    // the "coverage" snapshot (contrast-observability.ts's header).
    (audit) => {
      documentContrast = audit
      recomputeContrastSnapshot()
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
  // For the debug page's session picker and e2e assertions.
  document.body.dataset.swObservabilitySession = observabilitySessionId

  documentScope.registerDocument(sessionLifecycle.epoch)

  observabilityRecorder.count("sessions_started")
  observabilityRecorder.record({ kind: "session.start" })

  // Restore the last-known state synchronously so legacy/off tabs paint
  // correctly before the background responds (a cold background takes
  // 100–300 ms). Falls back to "auto" on the first visit.
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
          // Must run before filterConfig is assigned here: it compares
          // against the module-level value to detect a no-op.
          enterOrRefreshLegacy(response.config)
        } else {
          // Always take the authoritative config: cycleState() reads this
          // cache, so an idle off/auto tab must still pick up a style change.
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

  // SPA navigation re-patch: YouTube's router swaps large parts of the
  // document, up to `<head>`/`<body>`, around its `yt-navigate-*` events
  // (Theorem D.1(a): same-document navigation, epoch advances). Both handlers
  // key off `currentState`, so every mode is covered.
  //   - yt-navigate-start fires before the swap: re-arm the veil for every
  //     non-"off" state. Reacting only on finish could shorten a flash, never
  //     prevent it.
  //   - yt-navigate-finish fires once it settles: auto re-scans; legacy
  //     re-applies its filter, since the swap can carry off its <style>.
  window.addEventListener("yt-navigate-start", () => {
    observabilityRecorder.count("nav_starts")
    observabilityRecorder.record({ kind: "nav.start" })
    navigatingAway = true
    if (currentState === "off") return
    // A user-origin sheet belongs to the document, survives the swap, and is
    // in the cascade for every new element's first style, so there is
    // nothing to flash. A veil here would black out the page for the whole
    // navigation (~2.3 s on YouTube). nav-finish re-confirms.
    if (enforcedAndPresent()) {
      coverageWatchdog.check("nav-start:enforced")
      return
    }
    // Re-arms the veil and invalidates any resolveCommitted() in flight
    // (document-scope.ts's header).
    documentScope.reengage(sessionLifecycle.epoch)
    coverageWatchdog.check("nav-start")
  })

  window.addEventListener("yt-navigate-finish", () => {
    observabilityRecorder.count("nav_finishes")
    observabilityRecorder.record({ kind: "nav.finish" })
    navigatingAway = false

    if (currentState === "auto") {
      // A background-loaded tab that was never shown: discover() is exactly
      // the walk the gate deferred, and there is no session yet. The armed
      // waiter will start against the settled route.
      if (visibilityGate.pending) {
        coverageWatchdog.check("nav-finish:auto-deferred")
        return
      }
      if (enforcing) {
        if (!enforcedAndPresent()) {
          documentScope.reengage(sessionLifecycle.epoch)
          void runEnforcementRound(stateGeneration)
        }
        coverageWatchdog.check("nav-finish:enforced")
        return
      }
      sessionLifecycle.resetContent()
      // Defense in depth alongside the reactive observer: catches a route
      // swap's synchronous burst deterministically.
      shadowScopeDiscovery.discover(document)
      contentSession?.rescan()
      // After the rescan, against the settled route, and synchronously.
      if (deferredShadowContrast) {
        deferredShadowContrast = false
        shadowScopeTheming.recontrastAll()
      }
      coverageWatchdog.check("nav-finish:auto")
      scopeCoverageWatchdog.check(documentScope.registry, "nav-finish:auto")
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

  // A bfcache restore resumes this script rather than re-running init().
  // Under the sheet, re-run the confirm step: a no-op if nothing changed, a
  // release if the veil was up at pagehide, a fresh request if the sheet is
  // gone. Re-initialising the recorder and watchdogs (#1460) is out of scope.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted || !enforcing || currentState !== "auto") return
    if (!sheetPresent(enforcementDeps, DEFAULT_SWATCH_ID)) {
      documentScope.reengage(sessionLifecycle.epoch)
    }
    void runEnforcementRound(stateGeneration)
  })

  // Real navigation away (or tab close): flush and drop the index entry so
  // the debug page's picker does not accumulate dead sessions. Best-effort.
  window.addEventListener("pagehide", () => {
    // The visibility gate is deliberately NOT cancelled. On a real unload the
    // listener dies anyway; on a bfcache pagehide, a tab never yet shown
    // would lose its only startup callback and stay behind the opaque veil
    // forever, since restore resumes this script without re-initializing.
    // Running later against a disposed recorder is the lesser failure.
    coverageWatchdog.teardown()
    // A bfcache pagehide keeps this context alive, and the 250ms scope poll
    // would keep walking the registry with the recorder disposed.
    scopeCoverageWatchdog.teardown()
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
      // The carried config is authoritative. The background also sends this
      // redundantly; see enterOrRefreshLegacy().
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

    case "SET_LEGACY_STYLE":
    case "ENSURE_ENFORCEMENT":
    case "REMOVE_ENFORCEMENT": {
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
    // A throw here would otherwise leave the veil up forever with the failure
    // visible nowhere.
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
