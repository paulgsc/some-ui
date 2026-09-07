/**
 * The coverage watchdog — a Sensor dedicated to self-observation, separate
 * from `adapter/pipeline.ts`'s theming Sensor.
 *
 * Re-reads the live DOM artifacts `coverage-observability.ts`'s
 * `CoverageContext` needs (the veil, `data-sw-dark`, `data-sw-legacy`, the
 * legacy `<style>` tag's own text) on every mutation that could plausibly
 * have touched one of them, and evaluates the invariants against what is
 * actually there — never against what `content.ts` last believed it did.
 * See `coverage-observability.ts`'s header comment for why that distinction
 * is the whole point.
 *
 * ## Scope of observation, and why it stays cheap
 *
 * Two observers, neither with `subtree: true`:
 *
 *   - one on `document.documentElement` (`childList` + a narrow
 *     `attributeFilter`) — catches `<head>`/`<body>` being swapped wholesale
 *     (they are `<html>`'s direct children) and `<html>`'s own attributes
 *     changing;
 *   - one on `document.head` (`childList` + `subtree` + `characterData`) —
 *     catches the legacy/dark `<style>` tag being individually added or
 *     removed without the rest of `<head>` going with it, *and* a vendor
 *     reconciler that retains the tag but clears or replaces its own
 *     `textContent` in place (a `childList` mutation on the `<style>`
 *     element itself, a descendant of `<head>`, not on `<head>` directly —
 *     invisible to a non-subtree observer here, and invisible to
 *     `pipeline.ts`'s own Sensor too, since that mutation's target carries
 *     `[data-my-ext]` and is filtered out as self-authored). `subtree`
 *     stays scoped to `<head>`, not `<html>`, so it does not become the
 *     `subtree: true` walk this module's intro explains the cost of
 *     avoiding — `<head>`'s children churn nowhere near as often as
 *     `<body>`'s.
 *
 * `pipeline.ts`'s own Sensor already pays for a `subtree: true` walk in auto
 * mode, because it needs to find every vendor surface. This watchdog needs
 * none of that — every fact `CoverageContext` reads is reachable by id/
 * attribute lookup — so it deliberately does not reuse that observer or its
 * scope. A page as busy as a YouTube watch page can emit thousands of
 * subtree mutations a minute; a `childList`-only pair of observers is
 * unaffected by all of them and only fires for the handful that could matter
 * here, which is what makes running the check *un-throttled* affordable (the
 * whole reason to avoid debouncing it is in `coverage-observability.ts`'s
 * header — a coalesced check could straddle exactly the race it exists to
 * catch).
 *
 * The head observer is re-attached whenever the html observer sees `<head>`
 * itself get replaced (the `document.head` a listener captured at `observe()`
 * time is not the live one after that).
 *
 * ## Not purely observational
 *
 * One violation gets repaired here, not just recorded: `DarkSignalsAgree`
 * (`data-sw-dark` still declared true while `#__sw_dark_theme`'s actual CSS
 * is gone) re-arms the prepaint veil — see `repairDarkDesync()`. That is the
 * one gap this watchdog is positioned to close safely and unambiguously; the
 * legacy pair and the general "nothing at all is covering the page" case are
 * left to the existing recovery paths (nav-finish, the pipeline's own
 * reactive rescan) for reasons `repairDarkDesync()`'s own comment covers.
 *
 * That repair calls `enablePrepaint()` directly — a path SF-BS's (#1266)
 * document-scope registry does not own, same as `yt-navigate-start`'s own
 * direct call. `createCoverageWatchdog()`'s optional `onVeilRearmed`
 * callback exists so a caller tracking that registry's custody (content.ts,
 * via `documentScope.reengage()`) can reconcile exactly when this repair
 * fires, not just when navigation does — a plain cache-only reset is not
 * enough here either (see `document-scope.ts`'s own header for the race
 * that left open).
 */

import type {
  ScopeId,
  ScopeRegistry,
  ScopeStateKind,
  ScopeTransitionObserver,
} from "@filter/adapter/scope-registry"
import type { ShadowScopeDiscoveryMethod } from "@filter/adapter/shadow-scope-discovery"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
  LEGACY_FILTER_STYLE_ID,
  LEGACY_THEME_ATTR,
} from "@filter/lib/content/theme-apply"
import type { TabState } from "@filter/types/tab"
import { runInvariants } from "@some-extension/common/observability"

import {
  coverageInvariants,
  scopeArtifactPresent,
  type CoverageContext,
  type CoverageCounter,
  type CoverageEventKind,
  type CoverageRecorder,
  type ScopeCoverageEntry,
} from "./coverage-observability"
import {
  enablePrepaint,
  PREPAINT_DIRTY_CLASS,
  PREPAINT_VEIL_ID,
} from "./prepaint"

export type CoverageWatchdog = {
  /** Attach both observers. Idempotent. */
  observe(): void
  /** Force an immediate check outside of the mutation-driven path — call right after a state transition or nav event so the timeline records the moment that happened, not just the next incidental mutation. */
  check(reason: string): void
  /** Disconnect both observers. Safe to call when not observing. */
  teardown(): void
}

/** Which event pair, and which counter, each invariant's violation maps to. */
const EVENT_FOR: Readonly<
  Record<string, { violated: CoverageEventKind; recovered: CoverageEventKind }>
> = {
  CoverageHeld: {
    violated: "coverage.violated",
    recovered: "coverage.recovered",
  },
  LegacySignalsAgree: {
    violated: "legacy.signal_mismatch",
    recovered: "legacy.signal_resolved",
  },
  DarkSignalsAgree: {
    violated: "dark.signal_mismatch",
    recovered: "dark.signal_resolved",
  },
  VeilColorMatchesLegacyState: {
    violated: "veil.color_mismatch",
    recovered: "veil.color_resolved",
  },
}

const COUNTER_FOR: Readonly<Record<string, CoverageCounter>> = {
  CoverageHeld: "coverage_violations",
  LegacySignalsAgree: "legacy_signal_mismatches",
  DarkSignalsAgree: "dark_signal_mismatches",
  VeilColorMatchesLegacyState: "veil_color_mismatches",
}

function collectContext(getTabState: () => TabState): CoverageContext {
  const html = document.documentElement
  const veil = document.getElementById(PREPAINT_VEIL_ID)
  const legacyStyle = document.getElementById(LEGACY_FILTER_STYLE_ID)
  const darkStyle = document.getElementById(DARK_THEME_STYLE_ID)

  return {
    now: Date.now(),
    tabState: getTabState(),
    veilPresent: veil !== null,
    dirtyClassPresent: html.classList.contains(PREPAINT_DIRTY_CLASS),
    darkThemeActive: html.hasAttribute(DARK_THEME_ATTR),
    darkStyleActive: darkStyle?.textContent.includes("--sw-bg-0") ?? false,
    legacyAttrPresent: html.hasAttribute(LEGACY_THEME_ATTR),
    legacyStyleActive: legacyStyle?.textContent.includes("filter:") ?? false,
    veilBackgroundColor:
      veil instanceof HTMLElement
        ? getComputedStyle(veil).backgroundColor
        : null,
  }
}

/**
 * Repair the one coverage gap this watchdog can safely close on its own:
 * `data-sw-dark` (declared, `<html>`, survives a `<head>` swap) still says
 * the static dark-theme layer should be on, but `#__sw_dark_theme` (real,
 * inside `<head>`) is gone — a vendor document flush carried off the
 * stylesheet and left the attribute behind. content.ts still believes dark
 * is required; nothing is currently rendering it. Re-arming the veil closes
 * that window until the next pipeline round (nav-finish, or the Sensor's own
 * reactive rescan) settles a fresh verdict and lifts it again.
 *
 * Deliberately narrower than "any CoverageHeld violation": the same
 * invariant also fires, correctly, whenever `decide()` itself emits
 * `restore-native` (the page reads as already dark, so content.ts's onFire
 * routes an EXONERATED_NATIVE verdict through document-scope.ts's registry
 * custodian, releasing the veil on purpose — SF-BS, #1266) — there both
 * signals go false
 * *together*, `darkThemeActive === darkStyleActive` still holds, and
 * `DarkSignalsAgree` does not fire. Keying the repair off that invariant
 * instead of `CoverageHeld` is what keeps a correct "native already dark,
 * nothing to cover" verdict from being clobbered by a veil that would never
 * come back down.
 *
 * The legacy pair gets no equivalent repair here: `VeilColorMatchesLegacyState`
 * documents why the veil's *color* under legacy is selected from the
 * `data-sw-legacy` attribute alone (prepaint.css's `html[data-sw-legacy]`
 * selector), so re-arming it while that attribute is stale but the filter
 * genuinely isn't running would paint a white veil with no invert() left to
 * composite it back to dark — trading one gap for a literal flash. The dark
 * veil's color has no such dependency, so no equivalent risk exists here.
 */
/** Returns whether it actually re-armed the veil, so a caller whose custody bookkeeping lives outside this module (SF-BS, #1266's `documentScope.reengage()`) knows to reconcile — this call is exactly as much a bypass of the registry as `yt-navigate-start`'s own direct `enablePrepaint()` call, for the same reason. */
function repairDarkDesync(ctx: CoverageContext): boolean {
  if (ctx.tabState !== "auto") return false
  if (!ctx.darkThemeActive || ctx.darkStyleActive) return false
  enablePrepaint()
  return true
}

export function createCoverageWatchdog(
  recorder: CoverageRecorder,
  getTabState: () => TabState,
  /**
   * Called immediately after `repairDarkDesync()` actually re-arms the
   * veil (never on a check that finds nothing to repair). content.ts wires
   * this to `documentScope.reengage()` — a plain idempotency-cache reset is
   * not enough here: it would not invalidate a `resolveCommitted()` call
   * still in flight, which could otherwise complete afterward and tear the
   * veil this repair just put back up right back down (see
   * `document-scope.ts`'s own header), the same bug class
   * `yt-navigate-start` needed the same fix for.
   */
  onVeilRearmed?: () => void
): CoverageWatchdog {
  let htmlObserver: MutationObserver | null = null
  let headObserver: MutationObserver | null = null
  let observedHead: HTMLHeadElement | null = null
  // Invariant name -> epoch ms the violation started, for the duration aggregate.
  const violatedSince = new Map<string, number>()
  let lastStatus = new Map<string, "ok" | "violated" | "unknown">()

  function attachHeadObserver(): void {
    if (observedHead === document.head) return
    headObserver?.disconnect()
    observedHead = document.head
    headObserver = new MutationObserver(() => check("head-mutation"))
    // subtree + characterData: a content-only wipe of an existing extension
    // <style> tag (textContent = "", or a direct Text.data mutation) must be
    // caught here — see this module's header comment for why neither a
    // childList-only observer on <head> itself nor pipeline.ts's Sensor sees
    // it.
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  function check(reason: string): void {
    const ctx = collectContext(getTabState)
    recorder.count("coverage_checks")
    recorder.setSnapshot("coverage", { ...ctx, reason })

    // Fire-and-forget: the check itself must stay synchronous (see this
    // module's header) but recording the outcome need not block it.
    void runInvariants(coverageInvariants, ctx, ctx.now).then((results) => {
      for (const result of results) {
        if (
          result.name === "DarkSignalsAgree" &&
          result.status === "violated"
        ) {
          if (repairDarkDesync(ctx)) {
            onVeilRearmed?.()
          }
        }

        const previous = lastStatus.get(result.name)
        lastStatus.set(result.name, result.status)
        if (result.status === previous) continue

        const events = EVENT_FOR[result.name]
        const counter = COUNTER_FOR[result.name]
        if (events === undefined) continue

        if (result.status === "violated") {
          violatedSince.set(result.name, ctx.now)
          if (counter !== undefined) recorder.count(counter)
          recorder.record({
            kind: events.violated,
            severity: "error",
            detail: { reason, details: result.details ?? null },
          })
          continue
        }

        if (result.status === "ok" && previous === "violated") {
          const since = violatedSince.get(result.name)
          violatedSince.delete(result.name)
          if (since !== undefined) {
            recorder.observe("violation_duration_ms", ctx.now - since)
          }
          recorder.record({
            kind: events.recovered,
            detail: {
              reason,
              heldForMs: since !== undefined ? ctx.now - since : null,
            },
          })
        }
      }
    })
  }

  return {
    observe(): void {
      if (htmlObserver !== null) return
      htmlObserver = new MutationObserver(() => {
        attachHeadObserver()
        check("html-mutation")
      })
      htmlObserver.observe(document.documentElement, {
        childList: true,
        attributes: true,
        attributeFilter: ["class", DARK_THEME_ATTR, LEGACY_THEME_ATTR],
      })
      attachHeadObserver()
      lastStatus = new Map()
      violatedSince.clear()
      check("observe-start")
    },
    check,
    teardown(): void {
      htmlObserver?.disconnect()
      htmlObserver = null
      headObserver?.disconnect()
      headObserver = null
      observedHead = null
    },
  }
}

// ── SF-OB (#1270): scope-quantified coverage ─────────────────────────────────
//
// A second, independent watchdog, deliberately not folded into
// `createCoverageWatchdog` above: that one's whole design (this file's own
// header) is *purely reactive*, scoped to two cheap, narrow `<html>`/`<head>`
// observers specifically because the document is the only scope it watches.
// A live scope can be an arbitrarily-nested `ShadowRoot` anywhere in the
// page, so there is no equivalently narrow DOM region to observe reactively
// for "did some scope's own artifact change" — the same reachability
// argument `shadow-scope-discovery.ts`'s own `DISCOVERY_POLL_MS` backstop
// already makes for *discovering* a scope applies here to *auditing* one.
// This watchdog therefore polls, at a cadence chosen for debug-page
// freshness only (nothing safety-critical depends on this running fast —
// per #1270's own "out of scope: any new custody logic," this instrument
// never repairs anything it finds, only reports it).
//
// Two halves, wired at different points in a caller's own construction
// order (`content.ts`'s own module-init sequence, `registryObserver`/
// `onDiscovered` passed into `createScopeRegistry()`/
// `createShadowScopeDiscovery()` *before* either exists as a live object,
// `observe()`/`check()` called *after*, once both do):
//
//   1. Event-driven cumulative counters (`registryObserver`, `onDiscovered`)
//      — fired synchronously by `scope-registry.ts`'s own transition wrapper
//      and `shadow-scope-discovery.ts`'s own registration call, so these
//      need no polling at all: hold/release/rehold/commit/exoneration/
//      failure/stale-discard counts, per-scope state-duration timings, and
//      the census-vs-reactive discovery split are all exact, not sampled.
//   2. The periodic per-scope snapshot and `ScopeCoverageHeld` check
//      (`observe()`/`check()`) — this is the half that actually needs
//      polling: whether a scope's own DOM artifact is still present can
//      drift with no registry transition at all (a vendor stripping
//      `data-sw-patched` off a `COMMITTED` scope's surface is explicitly
//      *not* treated as vendor evidence by `shadow-scope-discovery.ts`'s own
//      `isThemeTaggingMutation` filter — see that function's own doc
//      comment — so nothing else in this codebase ever notices).

/** Diagnostics-freshness cadence only — see this section's own header for why this is a poll rather than a reactive observer, and why its exact value carries no safety weight the way `DISCOVERY_POLL_MS` (that constant's own doc comment) does. */
export const SCOPE_COVERAGE_POLL_MS = 250

/**
 * Hard cap on how many individual scope entries the "scopes" snapshot
 * itemizes, independent of `createCoverageRecorder`'s own (already-widened)
 * `maxDetailBytes` — bot-found (#1327's own review). A page extreme enough
 * to exceed even that budget must still produce a *renderable* snapshot
 * (`byState`/`totalScopes` accurate over every live scope, `scopes` capped
 * with `truncated: true`) rather than silently failing
 * `debug/index.ts`'s own `isScopeCoverageSnapshot()` type guard and losing
 * the per-scope breakdown entirely — the same failure mode the byte-budget
 * widening alone does not fully close for a sufficiently pathological page.
 * ~120 bytes/entry (a `shadow:NNN` id, a same-shaped parent id, kind,
 * boolean) keeps 100 entries comfortably under the 16 KB budget alongside
 * `byState`/`now`/`reason`'s own small fixed overhead.
 */
export const MAX_SNAPSHOT_SCOPE_ENTRIES = 100

/** SF-OB's own per-scope snapshot shape, published under `setSnapshot("scopes", ...)` — read by `debug/index.ts`'s per-scope breakdown table. */
export type ScopeCoverageSnapshot = {
  readonly now: number
  readonly totalScopes: number
  /**
   * Every `ScopeStateKind` (including `DISCOVERED_UNHELD`), zero-filled.
   * `DISCOVERED_UNHELD`'s own count is asserted zero here by construction —
   * `scope-registry.ts`'s own type system never lets this registry produce
   * one as a resting value (`DiscoveredUnheldStateKind`'s own doc comment) —
   * included so that guarantee is externally checkable in the diagnostics
   * bundle a human reads, per #1270's own acceptance criterion, not merely
   * true of code nobody re-verifies from the outside.
   */
  readonly byState: Readonly<Record<ScopeStateKind, number>>
  /**
   * Capped at `MAX_SNAPSHOT_SCOPE_ENTRIES` — `totalScopes`/`byState` above
   * stay accurate over *every* live scope regardless; only this itemized
   * list is bounded. See `MAX_SNAPSHOT_SCOPE_ENTRIES`'s own doc comment.
   */
  readonly scopes: ReadonlyArray<ScopeCoverageEntry>
  /** True when `scopes` above was truncated — `totalScopes - scopes.length` more exist but aren't itemized in this snapshot. */
  readonly truncated?: boolean
}

export type ScopeCoverageWatchdog<Rho = unknown, Pi = unknown> = {
  /** Pass to `createScopeRegistry()` at construction time. */
  readonly registryObserver: ScopeTransitionObserver<Rho, Pi>
  /** Pass to `createShadowScopeDiscovery()` at construction time. */
  onDiscovered(id: ScopeId, method: ShadowScopeDiscoveryMethod): void
  /** Starts the periodic per-scope check against `registry`. Idempotent. */
  observe(registry: ScopeRegistry<Rho, Pi>): void
  /** Force an immediate check outside the poll cadence — call right after a state transition or nav event, mirroring `CoverageWatchdog.check()`'s own rationale. */
  check(registry: ScopeRegistry<Rho, Pi>, reason: string): void
  /** Stops the poll. Safe to call when not observing. */
  teardown(): void
}

export function createScopeCoverageWatchdog<Rho = unknown, Pi = unknown>(
  recorder: CoverageRecorder
): ScopeCoverageWatchdog<Rho, Pi> {
  const enteredAt = new Map<ScopeId, number>()
  // Keyed by scope id, not one aggregate flag (ScopeCoverageHeld's own
  // shape, coverage-observability.ts) — see checkArtifactCoverage()'s own
  // header for why a single aggregate boolean under-counts real violations
  // here.
  const artifactOk = new Map<ScopeId, boolean>()
  const violatedSince = new Map<ScopeId, number>()
  let pollHandle: ReturnType<typeof setInterval> | null = null
  // Content signature (id/kind/parent/artifactPresent per scope) of the
  // last *written* "scopes" snapshot — bot-found (#1327's own review): the
  // 250ms poll calling setSnapshot()/count() unconditionally on every tick
  // keeps re-arming the recorder's own 1s flush debounce forever, writing
  // the full diagnostics bundle to storage.local roughly once a second for
  // the entire lifetime of every open auto-mode tab, changed or not. Only
  // writing when this signature actually differs from the last check's
  // makes an idle tab (the overwhelmingly common case) settle into zero
  // ongoing storage churn, the same way the reactive document watchdog
  // above already only records on an actual transition.
  let lastSnapshotSignature: string | undefined

  function noteDuration(id: ScopeId, now: number): void {
    const since = enteredAt.get(id)
    if (since !== undefined) {
      recorder.observe("scope_state_duration_ms", now - since)
    }
    enteredAt.set(id, now)
  }

  function check(registry: ScopeRegistry<Rho, Pi>, reason: string): void {
    const now = Date.now()
    const scopes: Array<ScopeCoverageEntry> = registry.ids().map((id) => {
      const snap = registry.snapshot(id)
      // registry.ids() and registry.snapshot() both read the same live
      // Map — a snapshot is only ever undefined here if a concurrent
      // caller purged the id between the two calls, which this
      // synchronous function never does to itself.
      if (snap === undefined) {
        throw new Error(`[scope-coverage] no snapshot for live id: ${id}`)
      }
      return {
        id,
        kind: snap.state.kind,
        parent: snap.parent,
        artifactPresent: scopeArtifactPresent(snap.ref, snap.state.kind),
      }
    })

    const byState: Record<ScopeStateKind, number> = {
      HELD: 0,
      RESOLVING: 0,
      COMMITTED: 0,
      EXONERATED_NATIVE: 0,
      FAILED_HELD: 0,
      RETIRED: 0,
      // Asserted zero by construction, never incremented — see
      // ScopeCoverageSnapshot's own "byState" doc comment.
      DISCOVERED_UNHELD: 0,
    }
    for (const s of scopes) byState[s.kind] += 1

    // Excludes `now`/`reason`, which always differ — this signature is
    // "did the actually-interesting content change," not "did time pass."
    const signature = JSON.stringify({ byState, scopes })
    if (signature !== lastSnapshotSignature) {
      lastSnapshotSignature = signature
      const truncated = scopes.length > MAX_SNAPSHOT_SCOPE_ENTRIES
      recorder.setSnapshot("scopes", {
        now,
        totalScopes: scopes.length,
        byState,
        scopes: truncated
          ? scopes.slice(0, MAX_SNAPSHOT_SCOPE_ENTRIES)
          : scopes,
        ...(truncated ? { truncated: true } : {}),
        reason,
      })
      recorder.count("scope_coverage_checks")
    }
    // checkArtifactCoverage keeps its own per-scope-id bookkeeping and
    // records violation/recovery events directly — it must run every check
    // regardless of the write-gate above, not because it would otherwise
    // miss a transition (any real one also changes `signature`), but
    // because it *is* what maintains that per-id state in the first place.
    checkArtifactCoverage(scopes, now, reason)
  }

  /**
   * Diffs each scope's own `artifactPresent` against *that scope's own*
   * last-seen value — never a single aggregate "is anything violated right
   * now" flag. `ScopeCoverageHeld` (coverage-observability.ts) computes
   * exactly that aggregate, and is deliberately not used here: diffing the
   * aggregate against one shared `lastStatus` under-counts real violations
   * whenever one scope's violation resolves and a *different* scope's own
   * violation begins before a poll ever observes the momentary all-clear in
   * between — the aggregate reads "violated" both before and after, so nothing
   * ever appears to change. Bot-found in this story's own e2e coverage: a
   * document-scope bootstrap-timing violation (resolved within one poll tick)
   * masked the very shadow-scope desync this story exists to detect, because
   * both look identical to a single shared "violated" flag. Per-scope
   * tracking makes each scope's own transition independently observable
   * regardless of what any other scope is doing at the same time.
   */
  function checkArtifactCoverage(
    scopes: ReadonlyArray<ScopeCoverageEntry>,
    now: number,
    reason: string
  ): void {
    const liveIds = new Set<ScopeId>()
    for (const s of scopes) {
      if (s.artifactPresent === null) continue
      liveIds.add(s.id)
      const previous = artifactOk.get(s.id)
      artifactOk.set(s.id, s.artifactPresent)
      if (s.artifactPresent === previous) continue

      if (!s.artifactPresent) {
        violatedSince.set(s.id, now)
        recorder.count("scope_coverage_violations")
        recorder.record({
          kind: "scope.coverage_violated",
          severity: "error",
          detail: { id: s.id, kind: s.kind, reason },
        })
        continue
      }

      if (previous === false) {
        const since = violatedSince.get(s.id)
        violatedSince.delete(s.id)
        if (since !== undefined) {
          recorder.observe("violation_duration_ms", now - since)
        }
        recorder.record({
          kind: "scope.coverage_recovered",
          detail: {
            id: s.id,
            reason,
            heldForMs: since !== undefined ? now - since : null,
          },
        })
      }
    }

    // A retired-and-purged (or artifact-inapplicable) scope stops being
    // tracked — a later re-registration under the same id (Definition D.5's
    // "fresh identity" rule) must not read as a spurious recovery against
    // stale tracking.
    for (const id of artifactOk.keys()) {
      if (!liveIds.has(id)) {
        artifactOk.delete(id)
        violatedSince.delete(id)
      }
    }
  }

  return {
    registryObserver: {
      onTransition(id, event, to): void {
        noteDuration(id, Date.now())
        switch (event.kind) {
          case "register": {
            // Discovery attribution (census vs. reactive) and the
            // "scope.discovered" event itself are owned by onDiscovered
            // below, called separately by shadow-scope-discovery.ts right
            // after this same register() call — recording it here too would
            // double the event for every real discovery.
            recorder.count("scope_holds")
            return
          }
          case "resolve-committed": {
            recorder.count("scope_releases")
            recorder.count("scope_commits")
            recorder.record({ kind: "scope.committed", detail: { id } })
            return
          }
          case "resolve-exonerated": {
            recorder.count("scope_releases")
            recorder.count("scope_exonerations")
            recorder.record({ kind: "scope.exonerated", detail: { id } })
            return
          }
          case "resolve-failed": {
            recorder.count("scope_failures")
            recorder.record({
              kind: "scope.failed",
              severity: "warn",
              detail: { id, reason: event.reason },
            })
            return
          }
          case "invalidate":
          case "re-register": {
            recorder.count("scope_reholds")
            recorder.record({
              kind: "scope.reheld",
              detail: { id, cause: event.kind, to: to.kind },
            })
            return
          }
          case "retire": {
            recorder.count("scope_releases")
            recorder.record({ kind: "scope.retired", detail: { id } })
            return
          }
          case "start-resolving":
          case "retry": {
            // No hold/release/rehold of its own — the scope stays held
            // throughout HELD->RESOLVING and FAILED_HELD->RESOLVING alike.
            return
          }
          default: {
            const exhaustive: never = event
            throw new Error(
              `[scope-coverage] unhandled event: ${JSON.stringify(exhaustive)}`
            )
          }
        }
      },
      onStaleResolveDiscarded(id): void {
        recorder.count("scope_stale_resolves_discarded")
        recorder.record({
          kind: "scope.stale_resolve_discarded",
          severity: "warn",
          detail: { id },
        })
      },
    },

    onDiscovered(id, method): void {
      recorder.count(
        method === "census"
          ? "scopes_discovered_census"
          : "scopes_discovered_reactive"
      )
      recorder.record({ kind: "scope.discovered", detail: { id, method } })
    },

    observe(registry): void {
      if (pollHandle !== null) return
      check(registry, "observe-start")
      pollHandle = setInterval(() => {
        check(registry, "poll")
      }, SCOPE_COVERAGE_POLL_MS)
    },

    check,

    teardown(): void {
      if (pollHandle !== null) {
        clearInterval(pollHandle)
        pollHandle = null
      }
      artifactOk.clear()
      violatedSince.clear()
      enteredAt.clear()
    },
  }
}
