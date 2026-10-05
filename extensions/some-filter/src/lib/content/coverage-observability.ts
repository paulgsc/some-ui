/**
 * some-filter's observability adapter — the reference *content-script-scoped*
 * consumer of `@some-extension/common/observability` (suspender-ledger's
 * `worker/core/observability.ts` is the background-worker one).
 *
 * ## What this watches
 *
 * The canon's governing invariant (Remark C.1): "no page is ever displayed at
 * native vendor luminance when dark is required." It is *zero-leak*
 * (Definition C.0) — one uncovered frame is a failure — and holds over a
 * vendor's exogenous runtime (Definition 2.1): it is about our custody of
 * the covering, never about predicting the vendor.
 *
 * `CoverageHeld` makes it checkable: whenever the tab is not `"off"`, the
 * veil, the dark theme, or a genuinely-active legacy filter must hold. The
 * supporting invariants exist because each "active" signal is two DOM
 * artifacts (an attribute on `<html>` and a `<style>`) that a vendor
 * document flush can pull apart.
 *
 * ## Why measurement, not instrumentation of intent
 *
 * Logging at every call site that *intends* to arm the veil answers "did our
 * code run?", not "is the page covered?", and those diverge exactly when a
 * vendor removes an artifact we believe is there. `coverage-watchdog.ts`
 * re-reads the live DOM and evaluates the invariants against it. Intent
 * events (`state.changed`, `nav.*`) are timeline context only, never
 * evidence.
 *
 * ## Why per-session storage keys
 *
 * The state lives in each tab's content script: one recorder per page load
 * (a same-document SPA navigation keeps it, which is the window a nav flash
 * needs observing in). One shared `storage.local` key would let concurrent
 * tabs clobber each other's ring buffer, so each session gets its own key
 * (`sessionStorageKey`) and a small capped index (`readIndex`/`touchIndex`)
 * lets the debug page pick one.
 */

import { VEIL_STYLE } from "@filter/adapter/custody-primitive"
import type { ScopeStateKind } from "@filter/adapter/scope-registry"
import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import {
  PREPAINT_DIRTY_CLASS,
  PREPAINT_VEIL_ID,
} from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
} from "@filter/lib/content/theme-apply"
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
   * Per-scope lifecycle events (`ScopeTransitionObserver`). `scope.reheld`
   * covers both of Definition D.5's `invalidate` targets and `re-register`.
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
  /** The enforcement sheet's handshake, read from the cascade. */
  | "enforcement.confirmed"
  | "enforcement.timeout"
  | "enforcement.removed"

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
  /** Per-scope counterparts to the document counters above. */
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
  /** The liveness bound released the veil onto the native page. */
  | "enforcement_timeout"

export type CoverageAggregate =
  | "violation_duration_ms"
  /** Time a scope spent in one resting state before its next transition; the recorder's mean/min/max give average custody duration. */
  | "scope_state_duration_ms"

/**
 * Everything the invariants below need, gathered once per watchdog check by
 * reading the live DOM (`coverage-watchdog.ts`'s job) — never inferred from
 * what this extension's own code believes it last did.
 */
export type CoverageContext = {
  now: number
  tabState: TabState
  /**
   * True for the synchronous window between a new `tabState` being published
   * and its actuation completing. `applyState` triggers the `observe-start`
   * check inside that window, when the DOM still reflects the previous state
   * by construction, so `CoverageHeld` returns `{ok: "unknown"}` there.
   */
  transitioning: boolean
  /** The veil element is present (either the popover or the fallback path). */
  veilPresent: boolean
  /** `sw-dirty` is on `<html>` — the CSS backstop is active even if the veil element itself is gone. */
  dirtyClassPresent: boolean
  /** `data-sw-dark` is on `<html>` — the *declared* signal that the auto pipeline's static dark-theme layer should be switched on. */
  darkThemeActive: boolean
  /** `#__sw_dark_theme` exists in `<head>` and carries the theme's tokens — the *actual* signal. The attribute survives a `<head>` replacement that carries the stylesheet off, so the two can diverge. */
  darkStyleActive: boolean
  /** `data-sw-legacy` is on `<html>` — the *declared* signal that the legacy filter should be active. */
  legacyAttrPresent: boolean
  /** `#__sw_legacy_filter` exists (anchored on `<html>`) and contains a `filter:` rule — the *actual* signal. */
  legacyStyleActive: boolean
  /** The veil's own resolved `background-color`, or null when no veil is present to read it from. */
  veilBackgroundColor: string | null
  /**
   * The enforcement sheet is in this document's cascade, read from its
   * sentinel custom property on `<html>` (not the canvas colour, which a
   * vendor can match). Read only while enforcing; `false` otherwise.
   */
  enforcedCanvas?: boolean
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

/** Above this, a color reads as "light" for the veil-color check. Matches theme-detector.ts's PAGE_LUMINANCE_THRESHOLD default. */
const LIGHT_LUMINANCE_THRESHOLD = 0.4

export const coverageInvariants: ReadonlyArray<Invariant<CoverageContext>> = [
  {
    name: "CoverageHeld",
    description:
      'Remark C.1\'s zero-leak invariant, made checkable: "no page is ever displayed at native vendor luminance when dark is required." Whenever the tab is not "off", the veil, the dark theme, a genuinely-active legacy filter, or the enforcement sheet (read from the cascade) must be covering it.',
    check: (ctx): InvariantOutcome => {
      if (ctx.tabState === "off") return { ok: true }
      // Declining to judge rather than falsely certifying. This cannot mask
      // a real leak: these transitions produce one MutationObserver batch,
      // delivered after the synchronous window closes, so no frame composites
      // while `transitioning` is true (#1344).
      if (ctx.transitioning) return { ok: "unknown" }
      const covered =
        ctx.veilPresent ||
        ctx.dirtyClassPresent ||
        (ctx.darkThemeActive && ctx.darkStyleActive) ||
        (ctx.legacyAttrPresent && ctx.legacyStyleActive) ||
        ctx.enforcedCanvas === true
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
            enforcedCanvas: ctx.enforcedCanvas ?? false,
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

// ── Per-scope coverage ──────────────────────────────────────────────────────
//
// The same "measurement, not intent" discipline for every live scope:
// re-read each scope's DOM artifact, never trust the registry's `κ` alone.

/**
 * `createOcclusionHold()`'s veil, identified by what its self-healing
 * observer restores (`<hr>`, `aria-hidden`, exact `VEIL_STYLE`), never by
 * `HOLD_ATTR`: that marker is deliberately not restored (a vendor can strip
 * it without disabling the hold; see `isOwnNode`), so selecting on it would
 * report a permanent false violation. `isOwnNode()` itself is private to the
 * hold instance.
 */
function shadowOcclusionHoldPresent(root: ShadowRoot): boolean {
  for (const child of Array.from(root.children)) {
    if (
      child.tagName === "HR" &&
      child.getAttribute("aria-hidden") === "true" &&
      child.getAttribute("style") === VEIL_STYLE
    ) {
      return true
    }
  }
  return false
}

/**
 * The token every committed `:host {}` rule (`buildHostTokenRule()`)
 * embeds. A committed shadow scope is detected by this rule, not by
 * `data-sw-patched`: a scope with zero evidenced surfaces commits just as
 * legitimately, and `realizeShadowColors()` adopts the `:host` rule on every
 * commit.
 *
 * Matched only on a rule whose `cssText` *starts with* `:host`: the shared
 * static sheet's scrollbar rule also references `var(--sw-bg-0)`, and no
 * other rule adopted into a shadow scope uses `:host`.
 */
const HOST_TOKEN_RULE_SIGNATURE = "--sw-bg-0"

/** Whether `root`'s `adoptedStyleSheets` carry the scope's `:host` token rule — see `HOST_TOKEN_RULE_SIGNATURE`. */
function shadowRealizationPresent(root: ShadowRoot): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mirrors shadow-actuator.ts's own realizeShadowColors(): jsdom, this package's own unit-test environment, has no adoptedStyleSheets accessor on a fresh ShadowRoot, unlike the DOM spec's own always-initialized-array guarantee the lib types assume.
  for (const sheet of root.adoptedStyleSheets ?? []) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        rule.cssText.startsWith(":host") &&
        rule.cssText.includes(HOST_TOKEN_RULE_SIGNATURE)
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * One live scope's identity, resting kind, and whether its Definition D.5
 * `Safe_T`-required DOM artifact is present — the document's
 * declared-vs-actual split, per scope. `null` when the kind names no
 * artifact: `EXONERATED_NATIVE` is a claim about the vendor's DOM, and
 * `RETIRED`'s `Safe_T` disjunct is vacuous.
 */
export type ScopeCoverageEntry = {
  readonly id: string
  readonly kind: ScopeStateKind
  readonly parent: string | null
  readonly artifactPresent: boolean | null
}

/** Everything `ScopeCoverageHeld` needs, re-read from the live registry and each scope's root. */
export type ScopeCoverageContext = {
  readonly now: number
  readonly scopes: ReadonlyArray<ScopeCoverageEntry>
}

/**
 * The document scope (r_0) does not use the shadow-scope checks: its custody
 * is the `prepaint-start.js` veil/dirty-class backstop, not an `HOLD_ATTR`
 * element, and a valid COMMITTED round can carry zero `data-sw-patched`
 * elements (a canvas-only page needs no per-surface correction). Reuses the
 * artifacts `CoverageHeld` checks.
 */
function documentArtifactPresent(
  doc: Document,
  kind: ScopeStateKind
): boolean | null {
  switch (kind) {
    case "HELD":
    case "RESOLVING":
    case "FAILED_HELD": {
      const veilPresent = doc.getElementById(PREPAINT_VEIL_ID) !== null
      const dirtyClassPresent =
        doc.documentElement.classList.contains(PREPAINT_DIRTY_CLASS)
      return veilPresent || dirtyClassPresent
    }
    case "COMMITTED": {
      const darkThemeActive = doc.documentElement.hasAttribute(DARK_THEME_ATTR)
      const darkStyle = doc.getElementById(DARK_THEME_STYLE_ID)
      const darkStyleActive =
        darkStyle?.textContent.includes("--sw-bg-0") ?? false
      return darkThemeActive && darkStyleActive
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
 * Whether `root`'s custody artifact for `kind` is present; `null` for a kind
 * with nothing to check. The document (r_0, the only `Document` ref) goes to
 * `documentArtifactPresent()`.
 */
export function scopeArtifactPresent(
  root: Document | ShadowRoot,
  kind: ScopeStateKind
): boolean | null {
  if (root instanceof Document) {
    return documentArtifactPresent(root, kind)
  }
  switch (kind) {
    case "HELD":
    case "RESOLVING":
    case "FAILED_HELD": {
      return shadowOcclusionHoldPresent(root)
    }
    case "COMMITTED": {
      return shadowRealizationPresent(root)
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
 * The aggregate "is every live scope's artifact present right now" verdict,
 * a checkable canon-traceable predicate. Deliberately *not* what the scope
 * watchdog diffs across polls (see `checkArtifactCoverage` for why an
 * aggregate under-counts); nothing evaluates it on the hot path today.
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

/** One recorder per content-script instance (per real page load; see the header). */
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
    // The default 2 KB clamp would replace a large "scopes" snapshot (one
    // entry per live scope) with a truncated string that
    // isScopeCoverageSnapshot() rejects. 16 KB is still a fixed budget;
    // MAX_SNAPSHOT_SCOPE_ENTRIES is the backstop.
    maxDetailBytes: 16_384,
  })
}
