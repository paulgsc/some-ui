/**
 * some-filter's observability adapter — the reference implementation for a
 * *content-script-scoped* consumer of the workspace-shared flight recorder
 * (`@some-extension/common/observability`; see `suspender-ledger`'s
 * `worker/core/observability.ts` for the background-worker-scoped one).
 *
 * ## What this watches
 *
 * `docs/canon/dom-state-estimation-canon.typ` (Remark C.1) states
 * some-filter's own governing invariant plainly: "no page is ever displayed
 * at native vendor luminance when dark is required." That invariant is
 * *zero-leak* (Definition C.0) — a single uncovered frame is a completed
 * failure, not a rare defect to budget against — and it holds over "a
 * vendor's exogenous, uncoordinated runtime" (Definition 2.1): the canon is
 * explicit that this discipline is about *our own* custody of the page's
 * covering, never about predicting what the vendor's script will do next.
 *
 * This module's `CoverageHeld` invariant is that statement made checkable:
 * whenever the tab is not `"off"`, at least one of {prepaint veil up, dark
 * theme active, legacy filter genuinely active} must hold. The two
 * supporting invariants (`LegacySignalsAgree`, `VeilColorMatchesLegacyState`)
 * exist because this extension's own signals for "legacy is active" are two
 * separate DOM artifacts (an attribute on `<html>` and a `<style>` element in
 * `<head>`) that a vendor-driven document flush can pull apart — which is
 * exactly the failure mode a reported live flash traces back to, once one
 * exists to look for it.
 *
 * ## Why measurement, not instrumentation of intent
 *
 * The natural first instinct is to log an event at every call site that
 * *intends* to arm the veil or apply the filter. That would answer "did our
 * code run?", not "is the page actually covered?" — and per the canon above,
 * those two questions can diverge exactly when a vendor mutation removes an
 * artifact our code already believes is still there. `coverage-watchdog.ts`
 * (this module's sole consumer) instead re-reads the live DOM — the veil
 * element, `data-sw-dark`, `data-sw-legacy`, the legacy `<style>` tag's own
 * content — on every mutation that could have touched any of them, and
 * evaluates the invariants against what is actually present. Self-reported
 * intent events (`state.changed`, `nav.start`, `nav.finish`) are recorded
 * alongside purely for the timeline's narrative context, never as evidence
 * an invariant check relies on.
 *
 * ## Where this lives, and why it is not persisted like suspender-ledger's
 *
 * suspender-ledger's recorder lives once, in the background service worker —
 * a natural single writer. some-filter's interesting state lives in each
 * tab's content script instead: one recorder instance per page load, torn
 * down and recreated on every real navigation (a same-document SPA
 * navigation, e.g. `yt-navigate-*`, does *not* recreate it — the same
 * instance keeps recording across those, which is exactly the window a
 * SPA-navigation flash needs to be observed in).
 *
 * Persisting that straight to `storage.local` under one shared key, the way
 * `extensionStoragePersistence` is built to be used, would make concurrently
 * open tabs clobber each other's ring buffer on every flush — there is no
 * single writer to coordinate them. Instead each session gets its own
 * storage key (`sessionStorageKey`, below), and a small capped index
 * (`readIndex`/`touchIndex`) lets the debug page discover which sessions
 * exist and pick one, mirroring suspender-ledger's per-tab `tab:${tabId}`
 * snapshots but at the storage-key level rather than the snapshot-map level,
 * since there is no single recorder here for a snapshot map to belong to.
 */

import { HOLD_ATTR } from "@filter/adapter/custody-primitive"
import type { ScopeStateKind } from "@filter/adapter/scope-registry"
import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { ext } from "@filter/platform/content"
import type { TabState } from "@filter/types/tab"
import {
  extensionStoragePersistence,
  memoryPersistence,
  Recorder,
  type Invariant,
  type InvariantOutcome,
  type JsonValue,
  type ObservabilityPersistence,
} from "@some-extension/common/observability"

export type CoverageEventKind =
  | "session.start"
  | "state.changed"
  | "nav.start"
  | "nav.finish"
  | "coverage.violated"
  | "coverage.recovered"
  | "legacy.signal_mismatch"
  | "legacy.signal_resolved"
  | "dark.signal_mismatch"
  | "dark.signal_resolved"
  | "veil.color_mismatch"
  | "veil.color_resolved"
  /**
   * SF-OB (#1270): per-scope lifecycle events, generalizing the four kinds
   * above from the document alone to every scope in SF-RG's registry
   * (`scope-registry.ts`'s `ScopeTransitionObserver`). `scope.reheld` covers
   * both of Definition D.5's `invalidate` targets and `re-register` — all
   * three re-engage a scope's hold from a state that had released it.
   */
  | "scope.discovered"
  | "scope.retired"
  | "scope.committed"
  | "scope.exonerated"
  | "scope.failed"
  | "scope.reheld"
  | "scope.stale_resolve_discarded"
  | "scope.coverage_violated"
  | "scope.coverage_recovered"

export type CoverageCounter =
  | "sessions_started"
  | "state_changes"
  | "nav_starts"
  | "nav_finishes"
  | "coverage_checks"
  | "coverage_violations"
  | "legacy_signal_mismatches"
  | "dark_signal_mismatches"
  | "veil_color_mismatches"
  /**
   * SF-OB (#1270): quantified per-scope counterparts to the document-only
   * counters above — see `coverage-watchdog.ts`'s own `createScopeCoverageWatchdog`
   * header for exactly which `scope-registry.ts` transition/event maps to
   * which of these.
   */
  | "scope_coverage_checks"
  | "scope_coverage_violations"
  | "scopes_discovered_census"
  | "scopes_discovered_reactive"
  | "scope_holds"
  | "scope_releases"
  | "scope_reholds"
  | "scope_commits"
  | "scope_exonerations"
  | "scope_failures"
  | "scope_stale_resolves_discarded"

export type CoverageAggregate =
  | "violation_duration_ms"
  /** SF-OB (#1270): wall-clock time a scope spent in one resting state before its next transition — folded on every transition, so the recorder's own mean/min/max/count give "average custody duration" for free. */
  | "scope_state_duration_ms"

/**
 * Everything the invariants below need, gathered once per watchdog check by
 * reading the live DOM (`coverage-watchdog.ts`'s job) — never inferred from
 * what this extension's own code believes it last did.
 */
export type CoverageContext = {
  now: number
  tabState: TabState
  /** The veil element is present (either the popover or the fallback path). */
  veilPresent: boolean
  /** `sw-dirty` is on `<html>` — the CSS backstop is active even if the veil element itself is gone. */
  dirtyClassPresent: boolean
  /** `data-sw-dark` is on `<html>` — the *declared* signal that the auto pipeline's static dark-theme layer should be switched on. */
  darkThemeActive: boolean
  /** `#__sw_dark_theme` exists in `<head>` and its text actually carries the theme's tokens — the *actual* signal. Distinct from `darkThemeActive` for the same reason `legacyStyleActive` is distinct from `legacyAttrPresent`: the attribute lives on `<html>` and survives a `<head>` replacement that carries the stylesheet off, so a vendor document flush can pull the two apart. */
  darkStyleActive: boolean
  /** `data-sw-legacy` is on `<html>` — the *declared* signal that the legacy filter should be active. */
  legacyAttrPresent: boolean
  /** `#__sw_legacy_filter` exists in `<head>` and its text actually contains a `filter:` rule — the *actual* signal. */
  legacyStyleActive: boolean
  /** The veil's own resolved `background-color`, or null when no veil is present to read it from. */
  veilBackgroundColor: string | null
}

const violated = (details: JsonValue): InvariantOutcome => ({
  ok: false,
  details,
})

/**
 * Relative luminance of a `getComputedStyle().backgroundColor` string, or
 * null when it doesn't parse (e.g. `"transparent"` in engines that report it
 * literally rather than as `rgba(0, 0, 0, 0)`).
 */
function luminanceOf(css: string | null): number | null {
  if (css === null) return null
  const parsed = parseColor(css)
  return parsed === null
    ? null
    : relativeLuminance(parsed[0], parsed[1], parsed[2])
}

/** Above this, a color reads as "light" for the veil-color check. Matches theme-detector.ts's own PAGE_LUMINANCE_THRESHOLD default. */
const LIGHT_LUMINANCE_THRESHOLD = 0.4

export const coverageInvariants: ReadonlyArray<Invariant<CoverageContext>> = [
  {
    name: "CoverageHeld",
    description:
      'Remark C.1\'s zero-leak invariant, made checkable: "no page is ever displayed at native vendor luminance when dark is required." Whenever the tab is not "off", the veil, the dark theme, or a genuinely-active legacy filter must be covering it.',
    check: (ctx): InvariantOutcome => {
      if (ctx.tabState === "off") return { ok: true }
      const covered =
        ctx.veilPresent ||
        ctx.dirtyClassPresent ||
        (ctx.darkThemeActive && ctx.darkStyleActive) ||
        (ctx.legacyAttrPresent && ctx.legacyStyleActive)
      return covered
        ? { ok: true }
        : violated({
            tabState: ctx.tabState,
            veilPresent: ctx.veilPresent,
            dirtyClassPresent: ctx.dirtyClassPresent,
            darkThemeActive: ctx.darkThemeActive,
            darkStyleActive: ctx.darkStyleActive,
            legacyAttrPresent: ctx.legacyAttrPresent,
            legacyStyleActive: ctx.legacyStyleActive,
          })
    },
  },
  {
    name: "LegacySignalsAgree",
    description:
      "data-sw-legacy (declared) and #__sw_legacy_filter's actual filter rule (real) are two separate DOM artifacts theme-apply.ts sets together — a vendor document flush that carries off only one of them is exactly the kind of self-inflicted gap this catches.",
    check: (ctx): InvariantOutcome =>
      ctx.legacyAttrPresent === ctx.legacyStyleActive
        ? { ok: true }
        : violated({
            legacyAttrPresent: ctx.legacyAttrPresent,
            legacyStyleActive: ctx.legacyStyleActive,
          }),
  },
  {
    name: "DarkSignalsAgree",
    description:
      "data-sw-dark (declared, on <html>) and #__sw_dark_theme's actual token CSS (real, in <head>) are two separate DOM artifacts theme-apply.ts's activateDarkTheme() sets together — a vendor <head> replacement can carry off only the second, since the first lives outside <head> and survives. That is a repairable coverage gap, not just an observable one: coverage-watchdog.ts re-arms the prepaint veil when this fires with the attribute still declared true.",
    check: (ctx): InvariantOutcome =>
      ctx.darkThemeActive === ctx.darkStyleActive
        ? { ok: true }
        : violated({
            darkThemeActive: ctx.darkThemeActive,
            darkStyleActive: ctx.darkStyleActive,
          }),
  },
  {
    name: "VeilColorMatchesLegacyState",
    description:
      "prepaint.css sets the veil white (so a genuinely-active legacy invert() composites it to black) only while data-sw-legacy is present. If the veil is up while that attribute's truth has drifted from the filter actually rendering, the veil shows its declared color raw instead of composited-to-dark — a literal flash, not a shortened one.",
    check: (ctx): InvariantOutcome => {
      if (!ctx.veilPresent) return { ok: "unknown" }
      const luminance = luminanceOf(ctx.veilBackgroundColor)
      if (luminance === null) return { ok: "unknown" }
      const legacyActive = ctx.legacyAttrPresent && ctx.legacyStyleActive
      const readsLight = luminance > LIGHT_LUMINANCE_THRESHOLD
      // Legacy active -> veil should be declared white (so invert() -> black).
      // Legacy inactive -> veil should be declared dark (no filter to invert it).
      const expected = legacyActive
      return readsLight === expected
        ? { ok: true }
        : violated({
            legacyActive,
            veilBackgroundColor: ctx.veilBackgroundColor,
            veilLuminance: luminance,
          })
    },
  },
]

// ── SF-OB (#1270): per-scope coverage ───────────────────────────────────────
//
// Generalizes this module's own "measurement, not instrumentation of intent"
// discipline (this file's header) from the document alone to every live
// scope in SF-RG's registry (`scope-registry.ts`, #1265): re-read each
// scope's own DOM artifact directly, never trust the registry's `κ` value on
// its own to mean the artifact is actually there. `data-sw-patched` is
// checked by attribute presence via a raw selector, mirroring
// `shadow-scope-discovery.ts`'s own `isThemeTaggingMutation` — this
// codebase's other hardcoded literal for the same attribute, `actuator.ts`'s
// own `tagSurfaceElements()` being the sole writer and exporting no shared
// constant for it.

/** Mirrors `actuator.ts`'s own literal — see this section's header for why this is a second hardcoded copy, not a shared import. */
const SURFACE_PATCHED_SELECTOR = "[data-sw-patched]"

/**
 * One live scope's identity, resting kind, and whether its Definition D.5
 * `Safe_T`-required DOM artifact is actually present — the same
 * "declared vs actual" split `CoverageContext`'s own field pairs
 * (`darkThemeActive`/`darkStyleActive`, etc.) already make for the document,
 * generalized to any scope. `null` when the kind names no artifact of its
 * own to check: `EXONERATED_NATIVE` is a claim about the *vendor's* DOM, not
 * something this registry installs (`NativeExoneration`'s own doc comment);
 * `RETIRED`'s own `Safe_T` disjunct is vacuous (nothing needs to be true).
 */
export type ScopeCoverageEntry = {
  readonly id: string
  readonly kind: ScopeStateKind
  readonly parent: string | null
  readonly artifactPresent: boolean | null
}

/**
 * Everything `ScopeCoverageHeld` needs, gathered once per scope-coverage
 * check by re-reading the live registry and each scope's own root — never
 * inferred from what `scope-registry.ts`'s own `κ` value alone claims.
 */
export type ScopeCoverageContext = {
  readonly now: number
  readonly scopes: ReadonlyArray<ScopeCoverageEntry>
}

/**
 * Reads whether `root`'s own custody artifact for `kind` is actually
 * present. Exported so `coverage-watchdog.ts`'s periodic scope-coverage check can build a
 * `ScopeCoverageContext` entry per scope without duplicating the two
 * selectors this module already owns; `null` for a kind with nothing to
 * check (see `ScopeCoverageEntry`'s own doc comment).
 */
export function scopeArtifactPresent(
  root: Document | ShadowRoot,
  kind: ScopeStateKind
): boolean | null {
  switch (kind) {
    case "HELD":
    case "RESOLVING":
    case "FAILED_HELD": {
      return root.querySelector(`[${HOLD_ATTR}]`) !== null
    }
    case "COMMITTED": {
      return root.querySelector(SURFACE_PATCHED_SELECTOR) !== null
    }
    case "EXONERATED_NATIVE":
    case "RETIRED":
    case "DISCOVERED_UNHELD": {
      return null
    }
    default: {
      const exhaustive: never = kind
      throw new Error(
        `[coverage-observability] unhandled scope kind: ${String(exhaustive)}`
      )
    }
  }
}

/**
 * A single point-in-time aggregate verdict — "is every live scope's own
 * artifact present, right now" — analogous to `coverageInvariants`' own
 * `CoverageHeld` shape and independently unit-tested as one. Deliberately
 * *not* what `coverage-watchdog.ts`'s own `createScopeCoverageWatchdog`
 * diffs across polls to decide when to record a `scope.coverage_violated`/
 * `scope.coverage_recovered` event: an aggregate ok/violated boolean,
 * diffed against one shared "last status," under-counts real violations
 * whenever one scope's violation resolves and a *different* scope's own
 * violation begins before a poll ever observes the momentary all-clear in
 * between — both moments read as "violated" against the same aggregate, so
 * nothing appears to change. `createScopeCoverageWatchdog`'s own
 * `checkArtifactCoverage` instead diffs each scope's `artifactPresent`
 * against that scope's own last-seen value, independently. This invariant
 * stays exported for its own value as a checkable, canon-traceable
 * predicate (and a debug-page "Health" row is a natural future consumer)
 * rather than because anything in this codebase currently evaluates it on
 * the event-timeline's own hot path.
 */
export const scopeCoverageInvariants: ReadonlyArray<
  Invariant<ScopeCoverageContext>
> = [
  {
    name: "ScopeCoverageHeld",
    description:
      "Generalizes CoverageHeld (Remark C.1) to every live registered scope, not just the document: a scope in {HELD, RESOLVING, FAILED_HELD} must have its occlusion hold's veil physically present in its own root (Safe_T's conservative-presentation disjunct), and a COMMITTED scope must have at least one data-sw-patched-tagged element in its own root (Safe_T's committed-realization disjunct) — the same declared-vs-actual check CoverageHeld already makes for the document, at scope granularity.",
    check: (ctx): InvariantOutcome => {
      const failing = ctx.scopes.filter((s) => s.artifactPresent === false)
      return failing.length === 0
        ? { ok: true }
        : violated({
            scopeIds: failing.map((s) => s.id),
            kinds: failing.map((s) => s.kind),
          })
    },
  },
]

// ── The recorder ─────────────────────────────────────────────────────────────

const SESSION_KEY_PREFIX = "sf.observability.session."
const INDEX_KEY = "sf.observability.index.v1"
const MAX_INDEX_ENTRIES = 20

export function sessionStorageKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}.v1`
}

export type IndexEntry = {
  sessionId: string
  origin: string
  title: string
  tabState: TabState
  updatedAt: number
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (value === null || typeof value !== "object") return false
  return (
    typeof Reflect.get(value, "sessionId") === "string" &&
    typeof Reflect.get(value, "origin") === "string" &&
    typeof Reflect.get(value, "title") === "string" &&
    typeof Reflect.get(value, "tabState") === "string" &&
    typeof Reflect.get(value, "updatedAt") === "number"
  )
}

/** The debug page's session picker. Sorted most-recently-updated first. */
export async function readIndex(): Promise<Array<IndexEntry>> {
  try {
    const raw: unknown = await ext.storage.local.get(INDEX_KEY)
    const value: unknown =
      raw !== null && typeof raw === "object"
        ? Reflect.get(raw, INDEX_KEY)
        : undefined
    if (!Array.isArray(value)) return []
    return value.filter(isIndexEntry).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/**
 * Publish (or refresh) this session's index entry. Best-effort — a storage
 * failure here must not affect theming, so every call site swallows it.
 */
export async function touchIndex(entry: IndexEntry): Promise<void> {
  try {
    const existing = await readIndex()
    const next = [
      entry,
      ...existing.filter((e) => e.sessionId !== entry.sessionId),
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_INDEX_ENTRIES)
    await ext.storage.local.set({ [INDEX_KEY]: next })
  } catch {
    // Best-effort — diagnostics degrading must never affect theming.
  }
}

export async function removeFromIndex(sessionId: string): Promise<void> {
  try {
    const existing = await readIndex()
    const next = existing.filter((e) => e.sessionId !== sessionId)
    await ext.storage.local.set({ [INDEX_KEY]: next })
  } catch {
    // Best-effort.
  }
}

export type CoverageRecorder = Recorder<
  CoverageEventKind,
  CoverageCounter,
  CoverageAggregate,
  CoverageContext
>

/**
 * One recorder per content-script instance (i.e. per real page load — see
 * this module's own header comment for why that scope, and not one shared
 * across tabs, is correct here).
 */
export function createCoverageRecorder(
  sessionId: string,
  persist: boolean
): CoverageRecorder {
  const persistence: ObservabilityPersistence = persist
    ? extensionStoragePersistence({ key: sessionStorageKey(sessionId) })
    : memoryPersistence()

  return new Recorder<
    CoverageEventKind,
    CoverageCounter,
    CoverageAggregate,
    CoverageContext
  >({
    namespace: "some-filter",
    capacity: 300,
    invariants: coverageInvariants,
    persistence,
  })
}
