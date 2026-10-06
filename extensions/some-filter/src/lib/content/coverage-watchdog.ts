/**
 * The coverage watchdog — a Sensor dedicated to self-observation, separate
 * from `adapter/pipeline.ts`'s theming Sensor.
 *
 * Re-reads the live DOM artifacts `CoverageContext` needs (the veil,
 * `data-sw-dark`, `data-sw-legacy`, the legacy `<style>`'s text) on every
 * mutation that could have touched one, and evaluates the invariants against
 * what is there — never against what `content.ts` last believed it did (see
 * `coverage-observability.ts`'s header).
 *
 * ## Scope of observation, and why it stays cheap
 *
 * Three observers, none of them a `subtree: true` walk over `<html>`:
 *
 *   - `document.documentElement` (`childList` + a narrow `attributeFilter`):
 *     catches `<head>`/`<body>` being swapped and `<html>`'s attributes
 *     changing. The legacy `<style>` is anchored on `<html>` (so a `<head>`
 *     swap cannot carry it off), and this observer sees it added or removed;
 *   - `document.head` (`childList` + `subtree` + `characterData`): catches the
 *     dark `<style>` being removed, *and* a vendor clearing its `textContent`
 *     in place — a mutation on a `[data-my-ext]` descendant that
 *     `pipeline.ts`'s Sensor filters out as self-authored. `<head>` churns far
 *     less than `<body>`;
 *   - the legacy `<style>` element itself (same options): the same in-place
 *     wipe for the stylesheet outside `<head>`. Widening the `<html>` observer
 *     to `subtree` would be the whole-document walk this avoids, so it gets
 *     its own observer, re-attached whenever the `<html>` observer fires.
 *
 * Every fact `CoverageContext` reads is reachable by id/attribute lookup, so
 * this does not reuse the pipeline's subtree observer. A busy page emits
 * thousands of subtree mutations a minute; these observers ignore them,
 * which is what makes running the check un-throttled affordable (a debounced
 * check could straddle the race it exists to catch).
 *
 * The head observer is re-attached whenever `<head>` itself is replaced.
 *
 * ## Not purely observational
 *
 * One violation is repaired here: `DarkSignalsAgree` re-arms the veil (see
 * `repairDarkDesync()`). That bypasses the document-scope registry, so the
 * optional `onVeilRearmed` callback lets the caller reconcile custody
 * (content.ts → `documentScope.reengage()`; see `document-scope.ts`'s header).
 */

import { ENFORCEMENT_SENTINEL_PROPERTY } from "@filter/adapter/enforcement-sheet"
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
  /** Force an immediate check outside the mutation-driven path, so the timeline records a state transition or nav event when it happened. */
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

function collectContext(
  getTabState: () => TabState,
  getTransitioning: () => boolean,
  getEnforcedCanvas: () => string | null
): CoverageContext {
  const html = document.documentElement
  const veil = document.getElementById(PREPAINT_VEIL_ID)
  const legacyStyle = document.getElementById(LEGACY_FILTER_STYLE_ID)
  const darkStyle = document.getElementById(DARK_THEME_STYLE_ID)

  return {
    now: Date.now(),
    tabState: getTabState(),
    transitioning: getTransitioning(),
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
    enforcedCanvas: readEnforcedCanvas(html, getEnforcedCanvas()),
  }
}

/** See `CoverageContext.enforcedCanvas`. One style read, and only while enforcing. */
function readEnforcedCanvas(
  html: HTMLElement,
  expectedSwatchId: string | null
): boolean {
  if (expectedSwatchId === null) return false
  return (
    getComputedStyle(html)
      .getPropertyValue(ENFORCEMENT_SENTINEL_PROPERTY)
      .trim() === expectedSwatchId
  )
}

/**
 * Repair the one coverage gap this watchdog can safely close on its own:
 * `data-sw-dark` (on `<html>`, survives a `<head>` swap) still declares dark,
 * but `#__sw_dark_theme` (inside `<head>`) is gone — a vendor flush carried
 * off the stylesheet. Re-arming the veil covers the page until the next
 * pipeline round settles a fresh verdict.
 *
 * Keyed off `DarkSignalsAgree`, not `CoverageHeld`: `CoverageHeld` also fires,
 * correctly, when `decide()` emits `restore-native` and the veil is released
 * on purpose. There both signals go false together, so `DarkSignalsAgree`
 * holds and the correct "already dark" verdict is not clobbered.
 *
 * No equivalent legacy repair: the legacy veil's colour is selected from
 * `data-sw-legacy` alone (see `VeilColorMatchesLegacyState`), so re-arming it
 * while the attribute is stale and the filter gone would paint a white veil
 * with no invert() — trading a gap for a flash.
 *
 * Returns whether it re-armed the veil, so the caller can reconcile the
 * registry it bypassed.
 */
function repairDarkDesync(ctx: CoverageContext): boolean {
  if (ctx.tabState !== "auto") return false
  if (!ctx.darkThemeActive || ctx.darkStyleActive) return false
  enablePrepaint()
  return true
}

export function createCoverageWatchdog(
  recorder: CoverageRecorder,
  getTabState: () => TabState,
  /** True between `applyState` publishing a new `tabState` and its actuation completing — see `CoverageContext.transitioning`. */
  getTransitioning: () => boolean,
  /**
   * Called right after `repairDarkDesync()` re-arms the veil. content.ts
   * wires this to `documentScope.reengage()`, which also invalidates any
   * in-flight `resolveCommitted()` that would otherwise tear the veil back
   * down (`document-scope.ts`'s header).
   */
  onVeilRearmed?: () => void,
  /**
   * The swatch id the enforcement sheet's sentinel should carry while this
   * tab is enforcing, or `null` when it is not. See
   * `CoverageContext.enforcedCanvas`.
   */
  getEnforcedCanvas: () => string | null = () => null
): CoverageWatchdog {
  let htmlObserver: MutationObserver | null = null
  let headObserver: MutationObserver | null = null
  let observedHead: HTMLHeadElement | null = null
  let legacyStyleObserver: MutationObserver | null = null
  let observedLegacyStyle: HTMLElement | null = null
  // Invariant name -> epoch ms the violation started, for the duration aggregate.
  const violatedSince = new Map<string, number>()
  let lastStatus = new Map<string, "ok" | "violated" | "unknown">()

  function attachHeadObserver(): void {
    if (observedHead === document.head) return
    headObserver?.disconnect()
    observedHead = document.head
    headObserver = new MutationObserver(() => check("head-mutation"))
    // subtree + characterData: catches an in-place wipe of an extension
    // <style> (see the header).
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  // The legacy <style> is anchored on <html>, outside the head observer's
  // reach. Re-attached from the html observer's callback so a re-created
  // element is picked up on the mutation that announces it.
  function attachLegacyStyleObserver(): void {
    const style = document.getElementById(LEGACY_FILTER_STYLE_ID)
    if (style === observedLegacyStyle) return
    legacyStyleObserver?.disconnect()
    legacyStyleObserver = null
    observedLegacyStyle = style
    if (style === null) return
    legacyStyleObserver = new MutationObserver(() =>
      check("legacy-style-mutation")
    )
    legacyStyleObserver.observe(style, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  function check(reason: string): void {
    const ctx = collectContext(getTabState, getTransitioning, getEnforcedCanvas)
    recorder.count("coverage_checks")
    recorder.setSnapshot("coverage", { ...ctx, reason })

    // Fire-and-forget: the check itself must stay synchronous; recording the
    // outcome need not block it.
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
        attachLegacyStyleObserver()
        check("html-mutation")
      })
      htmlObserver.observe(document.documentElement, {
        childList: true,
        attributes: true,
        attributeFilter: ["class", DARK_THEME_ATTR, LEGACY_THEME_ATTR],
      })
      attachHeadObserver()
      attachLegacyStyleObserver()
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
      legacyStyleObserver?.disconnect()
      legacyStyleObserver = null
      observedLegacyStyle = null
    },
  }
}

// ── Scope-quantified coverage ─────────────────────────────────────────────────
//
// A second, independent watchdog. The document watchdog above is purely
// reactive because the document has a narrow region to observe; a live scope
// can be a `ShadowRoot` anywhere, so there is no narrow region, and (the same
// argument as `DISCOVERY_POLL_MS`) this polls. The cadence is for debug-page
// freshness only: this instrument never repairs anything, only reports.
//
// Two halves, wired at different points of content.ts's construction order
// (`registryObserver`/`onDiscovered` passed into `createScopeRegistry()`/
// `createShadowScopeDiscovery()`, then `observe()`/`check()` once they exist):
//
//   1. Event-driven counters (`registryObserver`, `onDiscovered`), fired
//      synchronously by the registry and discovery: exact, not sampled.
//   2. The periodic per-scope snapshot and `ScopeCoverageHeld` check. A
//      scope's DOM artifact can drift with no registry transition (a vendor
//      stripping `data-sw-patched` is deliberately not vendor evidence to
//      `isThemeTaggingMutation`), so nothing else notices.

/** Diagnostics-freshness cadence only; carries no safety weight, unlike `DISCOVERY_POLL_MS`. */
export const SCOPE_COVERAGE_POLL_MS = 250

/**
 * Hard cap on the scope entries the "scopes" snapshot itemizes, independent
 * of the recorder's `maxDetailBytes`. An extreme page must still produce a
 * snapshot that passes `debug/index.ts`'s `isScopeCoverageSnapshot()` guard
 * (`byState`/`totalScopes` exact, `scopes` capped with `truncated: true`).
 * ~120 bytes/entry keeps 100 entries well under the 16 KB budget.
 */
export const MAX_SNAPSHOT_SCOPE_ENTRIES = 100

/** The per-scope snapshot published under `setSnapshot("scopes", ...)`, read by `debug/index.ts`'s per-scope table. */
export type ScopeCoverageSnapshot = {
  readonly now: number
  readonly totalScopes: number
  /**
   * Every `ScopeStateKind`, zero-filled. `DISCOVERED_UNHELD` is zero by
   * construction (`DiscoveredUnheldStateKind`), included so that guarantee
   * is checkable from the diagnostics bundle.
   */
  readonly byState: Readonly<Record<ScopeStateKind, number>>
  /** Capped at `MAX_SNAPSHOT_SCOPE_ENTRIES`; `totalScopes`/`byState` cover every live scope. */
  readonly scopes: ReadonlyArray<ScopeCoverageEntry>
  /** True when `scopes` was truncated. */
  readonly truncated?: boolean
}

/**
 * Selects which scopes survive truncation: every scope with
 * `artifactPresent === false` first (in order), then the rest oldest-first.
 * A plain `slice` would hide a violation on scope 101+ from the debug page's
 * table even though the event still fires.
 */
function prioritizeViolations(
  scopes: ReadonlyArray<ScopeCoverageEntry>,
  limit: number
): Array<ScopeCoverageEntry> {
  const violating = scopes.filter((s) => s.artifactPresent === false)
  const healthy = scopes.filter((s) => s.artifactPresent !== false)
  return [...violating, ...healthy].slice(0, limit)
}

export type ScopeCoverageWatchdog<Rho = unknown, Pi = unknown> = {
  /** Pass to `createScopeRegistry()` at construction time. */
  readonly registryObserver: ScopeTransitionObserver<Rho, Pi>
  /** Pass to `createShadowScopeDiscovery()` at construction time. */
  onDiscovered(id: ScopeId, method: ShadowScopeDiscoveryMethod): void
  /** Starts the periodic per-scope check against `registry`. Idempotent. */
  observe(registry: ScopeRegistry<Rho, Pi>): void
  /** Force an immediate check outside the poll cadence, as `CoverageWatchdog.check()`. */
  check(registry: ScopeRegistry<Rho, Pi>, reason: string): void
  /** Stops the poll. Safe to call when not observing. */
  teardown(): void
}

export function createScopeCoverageWatchdog<Rho = unknown, Pi = unknown>(
  recorder: CoverageRecorder
): ScopeCoverageWatchdog<Rho, Pi> {
  const enteredAt = new Map<ScopeId, number>()
  // Per scope id, not one aggregate flag — see checkArtifactCoverage().
  const artifactOk = new Map<ScopeId, boolean>()
  const violatedSince = new Map<ScopeId, number>()
  let pollHandle: ReturnType<typeof setInterval> | null = null
  // Signature of the last *written* "scopes" snapshot. Writing on every
  // 250ms tick would keep re-arming the recorder's 1s flush debounce and
  // write storage.local about once a second for every open auto tab; gating
  // on change lets an idle tab settle to zero storage churn.
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
      // ids() and snapshot() read the same live Map; nothing purges
      // between them in this synchronous function.
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
      // Zero by construction, never incremented (see ScopeCoverageSnapshot).
      DISCOVERED_UNHELD: 0,
    }
    for (const s of scopes) byState[s.kind] += 1

    // Excludes `now`/`reason`, which always differ.
    const signature = JSON.stringify({ byState, scopes })
    if (signature !== lastSnapshotSignature) {
      lastSnapshotSignature = signature
      const truncated = scopes.length > MAX_SNAPSHOT_SCOPE_ENTRIES
      recorder.setSnapshot("scopes", {
        now,
        totalScopes: scopes.length,
        byState,
        scopes: truncated
          ? prioritizeViolations(scopes, MAX_SNAPSHOT_SCOPE_ENTRIES)
          : scopes,
        ...(truncated ? { truncated: true } : {}),
        reason,
      })
      recorder.count("scope_coverage_checks")
    }
    // Runs every check regardless of the write gate: it maintains the
    // per-id state itself.
    checkArtifactCoverage(scopes, now, reason)
  }

  /**
   * Diffs each scope's `artifactPresent` against *that scope's* last-seen
   * value. The aggregate `ScopeCoverageHeld` is deliberately not used:
   * diffed against one shared status, it under-counts whenever one scope's
   * violation resolves and another's begins between polls (it reads
   * "violated" both times). Seen in e2e: a short document-scope bootstrap
   * violation masked a shadow-scope desync.
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

    // A purged (or artifact-inapplicable) scope stops being tracked, so a
    // re-registration under the same id (Definition D.5's "fresh identity")
    // is not read as a recovery.
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
            // "scope.discovered" and its census/reactive attribution belong
            // to onDiscovered, called right after this register(); recording
            // here too would double it.
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
            // noteDuration() already folded this scope's final interval.
            // retire is always followed by registry.purge(id), which has no
            // observer callback, so drop the fresh entry here or the map
            // grows per retired scope and could misattribute a reused id.
            enteredAt.delete(id)
            return
          }
          case "start-resolving":
          case "retry": {
            // The scope stays held through HELD/FAILED_HELD -> RESOLVING.
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
      // Lifetime: started by observe() from applyState for any non-"off"
      // state, stopped by teardown() on entering "off" and on pagehide, and
      // NOT stopped when the tab goes hidden. See
      // shadow-scope-discovery.ts's exemption for why this says so plainly
      // rather than naming a teardown that was never wired.
      // eslint-disable-next-line extension-charter/require-named-lifetime -- lifetime stated above
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
      // Fold each scope's final interval before clearing: scopes (the
      // document especially) commonly reach teardown still resting in a
      // state, often the longest one, and dropping it would bias the
      // aggregate toward short transitions.
      const now = Date.now()
      for (const since of enteredAt.values()) {
        recorder.observe("scope_state_duration_ms", now - since)
      }
      artifactOk.clear()
      violatedSince.clear()
      enteredAt.clear()
    },
  }
}
