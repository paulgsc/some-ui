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
  type ContrastAudit,
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

/**
 * SF-RC5 (#1344): true for the single synchronous window inside applyState
 * between `currentState = state` (below) and that state's actuation
 * (`restoreVendor`/`runAutoTheme`/`applyTheme`/`disablePrepaint`)
 * completing. `coverageWatchdog.observe()` runs *inside* that window — on
 * the first call after an `off` state, it synchronously checks CoverageHeld
 * against the *new* currentState but the *old* DOM, since actuation hasn't
 * run yet. See `CoverageContext.transitioning`'s own doc comment for why
 * that gap needs a diagnostic flag rather than a timing fix (issue #1344's
 * own live-proof comment: the window produces no paintable frame).
 */
let transitioning = false

// True between yt-navigate-start and yt-navigate-finish. Guards runAutoTheme's
// onFire below: the route swap's own DOM churn can go quiet for pipeline.ts's
// 50ms debounce before finish ever fires, letting the pipeline's own
// MutationObserver drive an onFire round on a still-mid-swap page and drop
// the veil yt-navigate-start just re-armed. Deferred, not dropped — finish's
// rescan() below runs its own synchronous onFire round with this false again.
let navigatingAway = false

/**
 * Set when SF-RC4's interaction-settled shadow pass is skipped because a
 * navigation is in flight, and replayed by `yt-navigate-finish` once the
 * route settles. See that callback for why nothing else covers it.
 */
let deferredShadowContrast = false

// The content session's epoch source (Definition 5.4). Reset on every
// SPA-navigation re-patch (Theorem D.1(a)) — a full page reset (refresh)
// gets a fresh one for free, since this whole module re-initializes.
const sessionLifecycle = createSessionLifecycle()
let contentSession: ContentSession | null = null

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
//
// Constructed *before* the document scope below (SF-OB, #1270): the scope
// registry's own transition observer (`scopeCoverageWatchdog.registryObserver`)
// has to exist before `createScopeRegistry()` does, since that hook is a
// construction-time parameter, not something wired in afterward.
const observabilitySessionId = safeRandomUUID()
const observabilityRecorder: CoverageRecorder = createCoverageRecorder(
  observabilitySessionId,
  true
)

// SF-RC5 (#1344): the contrastHealth axis, independent of coverageHealth —
// see contrast-observability.ts's own header for why. Two sources feed the
// one persisted "contrast" snapshot: the document (pipeline.ts's own
// runContrastChannel, wired below) and every live shadow scope
// (shadow-scope-theming.ts's projectContrast, wired further down) —
// auditLegibility's TreeWalker does not cross a shadow boundary, so neither
// source alone sees the whole page (bot-found, Codex review round 1 on
// #1443). Each source's own uncapped ContrastAudit (never persisted
// directly) is kept here and merged with mergeContrastAudits() — which
// dedupes by (foreground, backdrop) pair across sources — on every report
// from either source, so the snapshot always reflects each source's
// last-known result without double-counting an identical pair audited in
// more than one scope (bot-found, Codex review round 2 on #1443).
let documentContrast: ContrastAudit = []
const shadowContrastByScope = new Map<ScopeId, ContrastAudit>()

function recomputeContrastSnapshot(): void {
  observabilityRecorder.setSnapshot(
    "contrast",
    mergeContrastAudits(
      [documentContrast, ...shadowContrastByScope.values()],
      Date.now()
    )
  )
}

// Quantifies coverage over every live scope in the registry below, not just
// the document (SF-OB, #1270) — see coverage-watchdog.ts's own header for
// why this is a second, independent watchdog rather than folded into
// coverageWatchdog. registryObserver/onDiscovered are wired into
// scopeRegistry/shadowScopeDiscovery at construction time immediately below;
// observe()/teardown() are called alongside shadowScopeDiscovery's own
// lifecycle further down, since scope coverage has nothing to observe
// outside auto mode either (same reasoning as shadowScopeDiscovery's own).
const scopeCoverageWatchdog: ScopeCoverageWatchdog<
  DocumentRevision,
  DocumentExonerationProof
> = createScopeCoverageWatchdog(observabilityRecorder)

// The scope registry (SF-RG, #1265) shared by the document scope and every
// discovered shadow scope — constructed explicitly (rather than relying on
// createDocumentScopeCustodian()'s own default) so scopeCoverageWatchdog's
// observer can be wired in from the start, not attached after scopes may
// already have registered. Wraps that observer rather than passing it
// directly: SF-RC5 (#1344), bot-found (Codex review round 2 on #1443) — a
// shadow scope's own last-reported contrast audit must not survive its
// retirement or its resolving EXONERATED_NATIVE (shadow-scope-theming.ts's
// own projectContrast never runs on that path, so nothing else would ever
// evict it), or a component-heavy page both leaks memory here and can keep
// ContrastHeld violated over a scope that is no longer themed or even live.
const scopeRegistry = createScopeRegistry<
  DocumentRevision,
  DocumentExonerationProof
>({
  onTransition(id, event, to) {
    scopeCoverageWatchdog.registryObserver.onTransition?.(id, event, to)
    // SF-RC5 (#1344), bot-found (Codex review round 4 on #1443): "retire"
    // and "resolve-exonerated" alone left a scope's stale audit behind
    // across the *other* ways a COMMITTED scope stops meaning what its last
    // audit said — "invalidate"/"re-register" tear the realization down to
    // re-resolve (projectContrast() only re-populates the entry if that
    // re-resolve actually reaches a fresh commit), and "resolve-failed"
    // lands FAILED_HELD without ever calling projectContrast at all. Evict
    // on every event except a fresh commit (which projectContrast's own
    // call already just populated, moments before this fires) and the two
    // no-op "still resolving" transitions, which change no realization.
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

// The document — rendering scope r_0 (Definition D.4) — as SF-RG's registry
// (#1265) sees it. Registered once, unconditionally, in init() below,
// before any tab-state decision runs: prepaint-start.js's veil already
// exists by the time this content script runs, so the registration is
// catching up to reality (Corollary D.1.1's day-zero case), not creating
// it. runAutoTheme()'s onFire routes decide/realize outcomes through it;
// yt-navigate-start and the coverage watchdog's repair call reengage() when
// they touch the physical veil directly — see document-scope.ts's own
// header for why legacy/off's own veil calls stay untouched regardless.
const documentScope: DocumentScopeCustodian =
  createDocumentScopeCustodian(scopeRegistry)

// Projects the real dark adapter into each discovered shadow scope (SF-AD,
// #1268) — the scan()/decide()/tag-surface + adopted-stylesheet realization
// cycle scoped to one ShadowRoot at a time, driven by shadowScopeDiscovery's
// own onScopeReady hook below. Constructed once, module-scope, for the same
// reason documentScope/shadowScopeDiscovery are: SWATCHES[DEFAULT_SWATCH_ID]
// is the one swatch this pipeline can select today (see pipeline.ts's own
// runAutoTheme() usage; no swatch-picker UI exists yet), so there is nothing
// per-runAutoTheme-call this instance would ever need to be recreated for.
const shadowScopeTheming: ShadowScopeTheming = createShadowScopeTheming(
  documentScope.registry,
  () => SWATCHES[DEFAULT_SWATCH_ID],
  () => sessionLifecycle.epoch,
  // SF-RC5 (#1344): the shadow half of the merged "contrast" snapshot — see
  // the documentContrast/shadowContrastByScope block above.
  (id, audit) => {
    shadowContrastByScope.set(id, audit)
    recomputeContrastSnapshot()
  }
)

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
// the life of this content script. onScopeReady wires SF-AD's own
// per-scope projection into SF-DC's discovery/custody: a scope reaches
// COMMITTED/EXONERATED_NATIVE only because this callback drives it there.
// onDiscovered wires SF-OB's own census-vs-reactive discovery accounting.
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

  // SF-RC5 (#1344), bot-found (Codex review rounds 1 and 4 on #1443): must
  // be set *before* coverageWatchdog.observe() below (round 1) — observe()'s
  // own first call after "off" synchronously runs its "observe-start" check
  // right there, against a DOM actuation hasn't touched yet, and setting
  // the flag any later left that exact check reading `transitioning: false`.
  // The guard below must also cover every teardown call between here and
  // actuation, not just actuation itself (round 4): shadowScopeDiscovery.
  // teardown() can throw while retiring a committed scope (an unguarded
  // CSSOM uninstall), and a throw anywhere between this assignment and a
  // narrower try/finally would leave `transitioning` stuck true forever —
  // not just for this one transient window, but permanently, since nothing
  // else ever resets it. The post-actuation check further down must also
  // still run on any exceptional path in this block — bot-found (Codex
  // review round 3 on #1443): resetting the flag alone left a genuine
  // uncovered state recorded only as "unknown" until some unrelated later
  // mutation happened to trigger a reactive check, which might never come.
  // Caught and re-thrown after that check runs, rather than swallowed, to
  // preserve the original behavior of a throw here surfacing to whatever
  // caller (a message handler) invoked applyState.
  transitioning = true
  let actuationError: unknown
  try {
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
    // #1280: stops alongside shadowScopeDiscovery, same reasoning.
    shadowScopeTheming.teardown()
    // SF-RC5 (#1344): both contrast sources go stale the moment their own
    // producer stops running — every shadow scope's own contrast contribution
    // stops the moment shadow-scope custody itself does (shadow scopes exist
    // only in auto mode, this module's own header), same as
    // shadowScopeDiscovery.teardown() above already applies to custody
    // itself; the document half stops the moment contentSession.teardown()
    // above disconnects it — bot-found (Codex review round 2 on #1443): an
    // earlier version cleared only the shadow half, so a document-level
    // violation from the auto round just left could linger in legacy/off,
    // where nothing is being audited at all, and if no shadow scope had ever
    // reported either, this block did not even persist a fresh snapshot to
    // say so.
    if (documentContrast.length > 0 || shadowContrastByScope.size > 0) {
      documentContrast = []
      shadowContrastByScope.clear()
      recomputeContrastSnapshot()
    }
    // Same lifecycle as shadowScopeDiscovery: nothing to poll outside auto
    // mode either (SF-OB, #1270). One last check() here, before teardown()
    // stops the poll and clears its own tracking, publishes the registry's
    // post-purge state — bot-found (#1327's own review, round 3): without it,
    // leaving auto with a shadow scope COMMITTED left the persisted "scopes"
    // snapshot (and debug.html's "Live scopes" table) showing that
    // already-purged scope indefinitely, since nothing ever checks again
    // outside auto mode to notice shadowScopeDiscovery.teardown() already
    // retired and purged it from the registry.
    //
    // Gated on `previous === "auto"` — bot-found (#1327's own review, round
    // 4): shadowScopeDiscovery only ever discovers/observes from inside
    // runAutoTheme(), so its teardown() here is already a no-op whenever the
    // previous mode wasn't auto, and r_0's own registry entry (still whatever
    // auto last left it, HELD or COMMITTED) is stale by then — a prior
    // legacy/off transition's own restoreVendor() already stripped that
    // artifact without ever updating the registry to say so. Checking it
    // anyway recorded a permanent false scope.coverage_violated on every
    // non-auto-to-non-auto transition, one this same call's following
    // teardown() then made unrecoverable by wiping the tracking that would
    // have recorded the eventual recovery.
    if (previous === "auto") {
      scopeCoverageWatchdog.check(
        documentScope.registry,
        "apply-state:teardown"
      )
    }
    scopeCoverageWatchdog.teardown()

    restoreVendor()
    // restoreVendor() only knows about the two pre-adapter layers (the
    // `data-sw-dark` attribute and the static theme sheet). Everything the
    // per-surface Actuator and the legibility channels realize is this
    // call's to drop — see clearRealizedColorState's own doc comment for
    // why no pipeline round ever gets the chance to (#1341).
    clearRealizedColorState()
    // A deferral is only ever replayed by auto mode's own nav-finish
    // handler, so one still pending when the mode changes has nothing left
    // to replay it and must not fire into a session that never scheduled it.
    deferredShadowContrast = false

    if (state === "auto") {
      // Do not pre-remove the veil here. runAutoTheme uses
      // withPrepaintSuppressed for snapshot isolation; the pipeline's onFire
      // hook handles veil teardown once the first decide/realize cycle
      // actually settles.
      runAutoTheme()
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
  // scopeCoverageWatchdog.observe() is started *before*
  // shadowScopeTheming.observe() below, deliberately: both poll on the same
  // cadence (SCOPE_COVERAGE_POLL_MS/SHEET_INTEGRITY_POLL_MS are both 250ms),
  // and two same-period setInterval polls fire in registration order on
  // every tick, forever — registering the diagnostic poll first is what lets
  // it actually observe a real desync (a vendor's own wholesale
  // adoptedStyleSheets reassignment, #1280) before this module's own
  // self-heal below can silently erase the evidence of it having happened at
  // all. Reversing this order would not make the repair any less correct,
  // but it would make coverage-watchdog.ts's own violation reporting for
  // this exact desync class unobservable in practice — undermining SF-OB's
  // whole point (quantified coverage observability) for the one case #1280
  // itself exists to fix.
  scopeCoverageWatchdog.observe(documentScope.registry)
  // #1280's own integrity poll: repairs a committed shadow scope whose
  // adoptedStyleSheets a vendor's own wholesale reassignment silently
  // dropped — a plain CSSOM write no MutationObserver here (or anywhere)
  // can see. Same lifecycle as shadowScopeDiscovery immediately above:
  // nothing to reconcile outside auto mode either.
  shadowScopeTheming.observe()

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

      // SF-RC3 (#1342), bot-found: a carrier inside a shadow scope whose own
      // ancestors are all transparent resolves its backdrop out past the
      // outermost host and into the light DOM — onto an element this round
      // may have just darkened. The two paths are not synchronized, and this
      // one is the slower: a top-level host's `class`/`style` change projects
      // its scope synchronously, while this round waits out
      // RECONCILE_POLICY's debounce first, so the scope can audit against a
      // backdrop that is still native. Nothing re-audits it afterwards — the
      // `data-sw-patched` write that darkens the backdrop is outside that
      // host observer's own `class`/`style` filter, and shadow scopes see no
      // mutation at all. Safe here specifically because `realize()` has
      // already run by the time onFire is called, so the scopes read the
      // backdrop this round actually painted.
      //
      // Gated on the actuator having actually *written*, not on the round's
      // own action list having changed (bot-found twice, Codex rounds 2 and
      // 3 on #1412 — first for being absent, then for being too coarse).
      //
      // The action list is the wrong signal: an element whose background
      // matches a `SurfaceKey` the page already has emits no new action at
      // all, yet `tagSurfaceElements` tags it and the existing rule darkens
      // it — measured, a real backdrop going white -> `rgb(20, 20, 20)`
      // under a shadow carrier with a byte-identical action list. Running
      // it on *every* round is the wrong signal in the other direction: the
      // "bounded by the scan this round already did" argument was wrong,
      // since `scan()`'s TreeWalker does not enter shadow trees at all, so
      // this walk is genuinely additional work — and for a scope holding
      // repairs `projectContrast` also rewrites `adoptedStyleSheets` twice.
      // A page with frequent unrelated light-DOM churn would pay both on
      // every debounced round.
      //
      // What actually moves a shadow carrier's backdrop is a write, so a
      // write is what this asks about. `restore-native` reports one too: it
      // moves every scope's backdrop back to native, which is exactly as
      // much of a change to re-audit against.
      if (outcome.kind === "ok" && outcome.realizationChanged) {
        shadowScopeTheming.recontrastAll()
      }

      documentScope.reportPipelineOutcome(outcome)
    },
    // SF-RC4 (#1343), bot-found: the interaction-settled contrast pass
    // inside pipeline.ts covers the light DOM only — auditLegibility's
    // TreeWalker does not cross a shadow boundary — so a `:hover`/`:focus`
    // colour swap on a carrier inside a web component, or a light-DOM
    // backdrop change such a carrier resolves onto, would leave that
    // scope's diagnostics and repairs calibrated to pre-interaction
    // colours. This is the same recontrastAll() the onFire path above
    // calls, on the one trigger that path never sees: an interaction
    // produces no round and no write, so `realizationChanged` never gates
    // it in.
    () => {
      // Skipped while a navigation is in flight, and *recorded* so it can be
      // replayed once that navigation settles (bot-found, Codex review
      // rounds 2 and 3 on #1415).
      //
      // Skipping is right on its own: a carrier whose backdrop resolves out
      // into the light DOM would otherwise be scored against a document in
      // the middle of being replaced, producing a repair calibrated to
      // transient colours.
      //
      // Replaying is a guarantee rather than an observed necessity, and the
      // distinction is worth stating because establishing it took three
      // review rounds and two instrumented builds.
      //
      // `discover()` does *not* re-project a surviving root: `walk()` calls
      // `registerShadowRoot()` only for roots absent from `idFor`, and
      // `resetContent()` does not touch that map. So the only other route to
      // `recontrastAll()` on this path is `onFire`'s, gated on the round
      // reporting a write — and a navigation that wrote nothing would strand
      // the scope.
      //
      // In practice this codebase's navigations *do* write (nav-start's
      // `reengage()` tears the realization down, so the finish-time rescan
      // necessarily re-realizes), and `onFire` fires `recontrastAll()`
      // synchronously about 2ms after `yt-navigate-finish` — measured. That
      // makes this replay belt-and-braces on the `yt-navigate-*` path today
      // rather than the sole trigger, and it is why the regression for it
      // cannot isolate it (see that spec's own note).
      //
      // It stays because it costs one boolean and removes the dependency on
      // that incidental property. Two earlier readings of this were wrong in
      // opposite directions and both came from under-measuring: "zero-write
      // navigation confirmed" sampled only the last of several rounds, and
      // "discover() re-projects" was never true at all.
      if (navigatingAway) {
        deferredShadowContrast = true
        return
      }
      shadowScopeTheming.recontrastAll()
    },
    // SF-RC5 (#1344): the document half of the merged "contrast" snapshot —
    // see the documentContrast/shadowContrastByScope block above. Never
    // folded into coverageHealth's own "coverage" snapshot, see
    // contrast-observability.ts's own header for why.
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
      // After the rescan, so the scopes are re-contrasted against the
      // settled route rather than the one being torn down — and
      // synchronously here, which is also what makes the regression for it
      // able to distinguish this replay from an incidental later trigger.
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

  // Real navigation away (or the tab closing) — flush whatever this session
  // recorded and drop its index entry so the debug page's picker does not
  // accumulate dead sessions. Best-effort: pagehide is not guaranteed on
  // every teardown path (a killed process gets neither), but it is the best
  // signal available from a content script.
  window.addEventListener("pagehide", () => {
    coverageWatchdog.teardown()
    // Bot-found (#1327's own review, round 3): a pagehide that places the
    // document in the back-forward cache does not destroy this content
    // script's context — the 250ms scope-coverage poll below survives it
    // and, with observabilityRecorder already disposed a statement below,
    // would keep walking and stringifying the entire scope registry every
    // tick forever with every recording call silently ignored. Stopping it
    // here mirrors coverageWatchdog.teardown() immediately above; restarting
    // either watchdog on a bfcache pageshow is out of scope for this story
    // (both watchdogs, not just this one, would need it).
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
