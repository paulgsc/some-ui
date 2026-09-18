/**
 * Projects the real dark adapter into each discovered shadow scope — SF-AD,
 * #1268, part of the SF-SCOPE epic (#1263). Needs SF-DC (#1267,
 * `shadow-scope-discovery.ts` — a scope must already be registered and held
 * before this has anything to resolve) and closes issue #1262's actual
 * reported symptom: SF-CN through SF-DC were all deliberately
 * theme-agnostic (Theorem D.2), so this is the first story in the epic
 * where a `Swatch`/color decision ever touches a shadow scope.
 *
 * Per #1268's own framing: "the estimator, adapter, and actuator logic
 * (`theme-adapter.ts`'s `decide`, the tag-surface half of `actuator.ts`'s
 * `realize`) are reused unchanged (Definition D.3's boundary already makes
 * them scope-agnostic; only the caller changes)." This module *is* that new
 * caller — the scoped counterpart to `pipeline.ts`'s `ingest()`/`fire()` for
 * a document, minus the coalescing/`MutationObserver` machinery `pipeline.ts`
 * owns for the document (a shadow scope's own reactive trigger is
 * `shadow-scope-discovery.ts`'s per-root observer, which calls `project()`
 * below directly — see that module's own `onScopeReady` parameter). The one
 * genuinely new piece of realization is `emit-surface-color`, which
 * `actuator.ts`'s document-level `<style>` element structurally cannot reach
 * across a shadow boundary — `shadow-actuator.ts`'s own header has that
 * module's full rationale.
 *
 * SF-RC3 (#1342) adds this module's second sense/decide/realize sub-pass —
 * the rendered-contrast channel (`legibility-audit.ts` +
 * `foreground-repair.ts`), the scoped counterpart to what `pipeline.ts`'s
 * own `fire()` runs for the document. It lives inside `install()` below,
 * after the theme is applied rather than beside it, because it measures what
 * was actually painted; its actions are never merged into `decide()`'s, so
 * rendered-contrast evidence still cannot vote on the native-dark verdict
 * (canon Remark C.6).
 *
 * `decide()` still returns document-scoped actions this module has no use
 * for (`activate-theme` — the static dark-canvas layer is a whole-document
 * concern, already realized once by `content.ts`'s own document-level
 * pipeline) — this module simply does not realize them; `decide()` itself
 * needed no change to support being called scoped to a shadow root (its own
 * `Hypothesis` parameter carries no notion of "which root" the evidence in
 * it came from).
 *
 * Custody handoff (Theorem D.3, `scope-registry.ts`'s own two-phase
 * `resolveCommitted`): this module's `install()` callback is synchronous —
 * tagging elements and adopting stylesheets are both plain, immediate DOM/JS
 * writes with nothing to await — so the registry's own `await
 * realization.install()` confirms the realization is fully in place before
 * `RESOLVING -> COMMITTED` ever lands and the scope's occlusion hold is
 * released, exactly #1268's own "the custody handoff only completes once
 * that realization is fully installed" acceptance criterion.
 */

import type { ContrastSourceReport } from "@filter/lib/content/contrast-observability"
import { detectVendorInvert } from "@filter/lib/content/vendor-filter"
import { invoke } from "@some-extension/transport/adapter/invoke"
import { createHypothesis } from "@some-extension/transport/estimator/hypothesis"
import {
  createProvenanceStore,
  update,
} from "@some-extension/transport/estimator/update"
import type { Epoch } from "@some-extension/transport/session/epoch"

import type { FilterAction, SurfaceAttr, SurfaceKey } from "./contracts"
import type {
  DocumentExonerationProof,
  DocumentRevision,
} from "./document-scope"
import { decideForegroundRepairs, tagRepairCarriers } from "./foreground-repair"
import {
  auditContrastPairs,
  auditLegibility,
  decideLegibility,
  realizeLegibility,
  withScopeTransitionsFrozen,
} from "./legibility-audit"
import {
  isShadowRoot,
  scan,
  withVendorColorsVisible,
  type ScanResult,
} from "./pipeline"
import type { ScopeId, ScopeRegistry } from "./scope-registry"
import {
  clearShadowSurfaceState,
  realizeShadowColors,
  shadowRealizationIntact,
  tagSurfaceElements,
  withShadowColorsVisible,
} from "./shadow-actuator"
import type { Swatch } from "./swatches"
import { decide } from "./theme-adapter"

/**
 * `SCOPE_COVERAGE_POLL_MS` (`coverage-watchdog.ts`), generalized to this
 * module's own narrower concern: this poll's own two triggers — a vendor's
 * wholesale `ShadowRoot.adoptedStyleSheets` reassignment (#1280), and the
 * page's own vendor-invert amount changing after a scope has already
 * committed (#1281, bot-found on this pair's own PR review — see
 * `reconcileCommittedSheets`'s own doc comment) — are each a plain CSSOM
 * property read/write with no corresponding DOM mutation, so nothing
 * reactive in this codebase can ever see either on its own (see
 * `shadow-actuator.ts`'s own `shadowRealizationIntact` doc comment).
 * Diagnostics-freshness cadence only, the same way that constant's own doc
 * comment describes itself — this bounds how long a scope stays stale
 * before this module's own poll notices and repairs it, carrying no safety
 * weight the way `DISCOVERY_POLL_MS` (`shadow-scope-discovery.ts`) does for
 * the *initial* coverage guarantee. 250ms matches that existing precedent
 * rather than inventing a third cadence for what is, per tick, an even
 * cheaper check (one `getComputedStyle` read plus a `Set` membership test
 * per `COMMITTED` scope, no DOM walk).
 */
export const SHEET_INTEGRITY_POLL_MS = 250

export type ShadowSceneRegistry = ScopeRegistry<
  DocumentRevision,
  DocumentExonerationProof
>

export type ShadowScopeTheming = {
  /**
   * Queues one scan/decide/realize round for `id`, run once every earlier
   * round queued for the *same* id has fully settled (this factory's own
   * `inFlight` serialization — see its doc comment for the overlapping-
   * commit race this closes, and `projectOnce()`'s own `forceInvalidate`
   * parameter for the lost-update gap serialization alone left open). A
   * queued round is a no-op once it actually runs unless `id`'s current
   * state is one the custody state machine still allows moving toward
   * COMMITTED (`HELD`, `RESOLVING`, or `FAILED_HELD` — mirrors
   * `document-scope.ts`'s own `ensureResolving`) and its registered `ref` is
   * a `ShadowRoot` — never the document scope, `r_0`, which stays
   * `content.ts`'s own pipeline's job, entirely unchanged by this story. A
   * `COMMITTED`/`EXONERATED_NATIVE` scope is usually re-opened by
   * `shadow-scope-discovery.ts`'s own `invalidate()` call *before* it calls
   * this; when a call instead arrives while a round already queued for the
   * same id is still settling, this function's own queue invalidates such a
   * scope itself once that call's turn comes, rather than relying solely on
   * the caller's own (necessarily earlier) check. Safe (and expected) to
   * call repeatedly for the same id in rapid succession — `project()` itself
   * returns immediately either way, never awaiting the round it just
   * queued.
   */
  project(id: ScopeId): void

  /**
   * Re-runs the rendered-contrast half for *every* currently-`COMMITTED`
   * shadow scope — what `recontrastDescendants` does for a shadow ancestor,
   * for the one ancestor every scope has: the document.
   *
   * Bot-found, Codex review round 2 on #1412, and the same class of defect
   * as that ancestor case rather than a second one: a carrier whose own
   * ancestors inside its root are all transparent resolves its backdrop
   * outward, and the walk does not stop at the outermost shadow host — it
   * continues into the light DOM and can land on an element the *document*
   * pipeline is about to darken. The two paths are not synchronized, and
   * the document's is the slower of the two: a top-level host's own
   * `class`/`style` change projects its scope immediately (that scope's host
   * observer calls `onScopeReady` synchronously), while the document's own
   * round is debounced by `RECONCILE_POLICY` first. So the scope audits
   * against a still-native light backdrop, and the `data-sw-patched` write
   * that darkens it moments later is outside that host observer's
   * `class`/`style` filter — nothing re-audits the scope, and dark explicit
   * text stays unrepaired on a now-dark backdrop.
   *
   * Called by `content.ts` from the document pipeline's own `onFire`, after
   * `realize()` has already run — on every settled round, deliberately
   * ungated; see that call site for why an "only when the action list
   * changed" gate is measurably wrong.
   */
  recontrastAll(): void

  /**
   * Starts a `SHEET_INTEGRITY_POLL_MS` periodic poll that checks every
   * currently `COMMITTED` scope's realization and, for any scope where
   * either (a) a vendor's own wholesale `adoptedStyleSheets` reassignment
   * has silently dropped its sheets (`shadow-actuator.ts`'s
   * `shadowRealizationIntact`, #1280), or (b) the page's own vendor-invert
   * amount has changed since it last committed (#1281 —
   * `reconcileCommittedSheets`'s own doc comment), forces the same repair a
   * genuine vendor mutation would: invalidate the scope (re-engaging its
   * hold, tearing down the stale realization) and `project()` it again,
   * re-scanning and re-realizing from scratch. Mirrors
   * `shadow-scope-discovery.ts`'s own `observe()`/`teardown()` shape;
   * idempotent, safe to call repeatedly.
   */
  observe(): void

  /** Stops the integrity poll `observe()` started. Idempotent. */
  teardown(): void
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Mirrors `document-scope.ts`'s own `ensureResolving`: `HELD`/`FAILED_HELD`/
 * `RESOLVING` are all "still trying to reach COMMITTED, safe to call
 * `resolve*` after this returns"; `COMMITTED`/`EXONERATED_NATIVE`/`RETIRED`/
 * unregistered are not this pass's job. Unlike that function, this one never
 * throws for an unexpected state — `project()` is called reactively, on
 * every genuine vendor mutation inside a scope's own subtree, including ones
 * a concurrent `retire()` (the scope's host detaching in the same
 * `MutationObserver` batch) can race against; a caller bug here should not
 * be able to crash the reactive discovery path over a scope that is simply
 * no longer relevant.
 */
function ensureResolving(registry: ShadowSceneRegistry, id: ScopeId): boolean {
  const state = registry.stateOf(id)
  if (state === undefined) return false

  switch (state.kind) {
    case "HELD": {
      registry.startResolving(id)
      return true
    }
    case "FAILED_HELD": {
      registry.retry(id)
      return true
    }
    case "RESOLVING": {
      return true
    }
    case "COMMITTED":
    case "EXONERATED_NATIVE":
    case "RETIRED": {
      return false
    }
    default: {
      const exhaustive: never = state
      throw new Error(
        `[shadow-scope-theming] unhandled state: ${JSON.stringify(exhaustive)}`
      )
    }
  }
}

/**
 * What a committed scope last realized, enough to re-run its
 * rendered-contrast half without re-deriving its classification. Recorded
 * per scope by `install()` and read back by `recontrastDescendants()`.
 */
type CommittedShadowRealization = {
  readonly actions: ReadonlyArray<FilterAction>
  readonly swatch: Swatch
  readonly vendorInvert: number
}

/**
 * Realizes `actions` into `root` and then runs the rendered-contrast
 * channel over it — SF-RC3 (#1342), the scoped counterpart to
 * `pipeline.ts`'s own `fire()` block.
 *
 * The audit is deliberately *after* the theme lands rather than beside it:
 * this channel measures what was actually painted (canon Definition C.3's
 * Φ_comfort), so it has to read post-actuation computed style. Audited
 * first, it would score every carrier against the vendor's own light
 * backdrop and conclude the page was already fine.
 *
 * Its actions are never merged into (or derived from) `actions`, so
 * rendered-contrast evidence still cannot vote on
 * `decide()`/`pageAlreadyDark()`'s verdict — #831's discipline, canon
 * Remark C.6. A throw anywhere here propagates to the caller: out of
 * `install()` into `resolveCommitted()` (#1266's FAILED_HELD path, the same
 * treatment a thrown `realizeShadowColors` already gets) on the commit path,
 * and into `recontrastDescendants`'s own per-scope guard on the other.
 *
 * The whole sequence runs under one freeze, and the leading
 * `realizeShadowColors(..., [])` is what that freeze is for: on the
 * re-contrast path this scope is already `COMMITTED` with its own repair
 * sheets adopted and enabled, so the audit would otherwise read back this
 * channel's own `!important` colour, call the carrier legible, and drop the
 * repair — SF-RC2's oscillation. Dropping the sheets first makes the read
 * see the authored colour; doing it inside the freeze is what stops that
 * drop from starting a vendor `transition` whose start value is the repair.
 * On the commit path there are no prior repairs and that call is an
 * idempotent no-op.
 *
 * Tagging and rule-realization are split, unlike the document path's single
 * `realizeForegroundRepairs()` call: the tags go on elements (scope-agnostic,
 * `foreground-repair.ts`'s `tagRepairCarriers`), but the rules must land in
 * *this* scope's `adoptedStyleSheets`, which only `realizeShadowColors`
 * owns. Passing the matched actions back into a second call keeps one
 * desired sheet set per root — see that function's own `repairs` parameter
 * for why a separately-tracked second set would be invisible to both the
 * #1280 integrity poll and `clearShadowSurfaceState`.
 */
function projectContrast(
  id: ScopeId,
  root: ShadowRoot,
  actions: ReadonlyArray<FilterAction>,
  swatch: Swatch,
  vendorInvert: number,
  onContrastAudited:
    | ((id: ScopeId, audit: ContrastSourceReport) => void)
    | undefined
): void {
  withScopeTransitionsFrozen(root, () => {
    realizeShadowColors(actions, root, swatch, vendorInvert, [])
    const scanned = auditLegibility(root)
    const legibilityActions = decideLegibility(scanned.attrsByKey)
    realizeLegibility(root, legibilityActions, scanned.elementsByKey)
    const repairs = tagRepairCarriers(
      root,
      decideForegroundRepairs(scanned.attrsByKey),
      scanned.elementsByKey
    )
    realizeShadowColors(actions, root, swatch, vendorInvert, repairs)
    onContrastAudited?.(id, auditContrastPairs(scanned, legibilityActions))
  })
}

export function createShadowScopeTheming(
  registry: ShadowSceneRegistry,
  /**
   * A live source, not a value fixed at construction (#1281) — mirrors
   * `epoch` below. `content.ts`'s own instance currently always returns the
   * same constant (`SWATCHES[DEFAULT_SWATCH_ID]`; no swatch-picker UI exists
   * yet), but the *compensation* `realizeShadowColors` (shadow-actuator.ts)
   * derives from `detectVendorInvert()` in `projectOnce()` below is never
   * constant — a vendor's own invert toggle can flip at any point in a
   * page's lifetime, the same reason `theme-apply.ts`'s own
   * `injectDarkTheme()` recomputes it on every call rather than caching it.
   */
  swatch: () => Swatch | null,
  epoch: () => Epoch,
  /**
   * SF-RC5 (#1344), bot-found (Codex review round 1 on #1443):
   * `auditLegibility`'s `TreeWalker` does not cross a shadow boundary, so
   * `pipeline.ts`'s own document-only `onContrastAudited` structurally
   * cannot see a violation living inside a shadow root — a page whose only
   * failing pair is shadow-hosted would otherwise report `contrastHealth`
   * healthy. Called with `id` and a fresh, uncapped `ContrastAudit` every
   * time `projectContrast` runs for that scope (the initial commit, and
   * every `recontrastAll()`/`recontrastDescendants()` re-run alike, since
   * all three route through that one function) — `content.ts` merges this
   * per-scope stream with the document's own via `mergeContrastAudits()`.
   * Never called for a scope that resolves `EXONERATED_NATIVE` (the
   * `restore-native` branch in `projectScope` below returns before
   * `projectContrast` ever runs) or that retires — `content.ts` is
   * responsible for evicting both from its own per-scope map itself, via
   * the registry's own transition observer, since neither produces a call
   * here to key an eviction off (bot-found, Codex review round 2 on #1443).
   * Also called with `id` and `null` — not an empty audit — when
   * `recontrastScopes`'s own catch below invalidates a scope whose
   * re-contrast threw mid-round: `null` means "this scope's own state this
   * round is unknown," distinct from a genuine empty audit (bot-found,
   * Codex confirming review round 3 on #1443) — see `ContrastSourceReport`'s
   * own doc comment.
   */
  onContrastAudited?: (id: ScopeId, audit: ContrastSourceReport) => void
): ShadowScopeTheming {
  /**
   * Every scope id with a `projectOnce()` call currently in flight (queued
   * or running), keyed to that call's own settling `Promise` — the
   * serialization queue `project()` below chains onto (bot-found, this
   * story's own review, round 3). Scoped to this factory call, not the
   * module: each `createShadowScopeTheming()` instance (one per test in
   * this module's own unit tests; one long-lived instance in `content.ts`)
   * needs its own independent queue — a module-level map would let two
   * unrelated instances (or two test cases) serialize against each other
   * over nothing more than an accidentally-reused scope id string.
   *
   * Without this, two observers reacting to mutations in the same
   * microtask-processing round — `shadow-scope-discovery.ts`'s own host and
   * per-root observers, both able to fire for one underlying vendor change
   * that touches a host's class *and* mutates content inside its shadow
   * root in the same synchronous turn — can each call `project(id)` before
   * either call's own `resolveCommitted()` has settled. Both then race
   * `scope-registry.ts`'s two-phase handoff with the *same* starting
   * `generation` (neither call bumped it, since neither has transitioned
   * yet): the first to resume after its own `install()` awaits commits
   * normally, bumping `generation` — but the second, resuming next with a
   * now-stale `generationAtStart`, takes `resolveCommitted()`'s own "stale
   * completion" branch and calls *its* `uninstall()`
   * (`clearShadowSurfaceState()`), indiscriminately stripping the
   * tags/sheets the *first* call just successfully installed. The registry
   * is left `COMMITTED` (the first call's own transition, never undone)
   * with its hold released (also the first call's own doing) while the
   * scope is visibly unthemed — `Safe_T` violated in exactly the way
   * `scope-registry.ts`'s own staleness check exists to prevent, just from
   * a source (two *overlapping* commits for the same id, not a
   * differently-typed concurrent transition) that check was never designed
   * to cover. Chaining every call for a given id onto the previous one's
   * own settling promise means a later call's `projectOnce()` never
   * *starts* until the earlier one has fully resolved — by which point
   * `ensureResolving()` correctly reads the fresh `COMMITTED` state and
   * no-ops, rather than racing a second `resolveCommitted()` against it.
   *
   * That no-op is *only* correct when the later call's own trigger arrived
   * before the earlier round's `scan()` ran — genuinely redundant evidence
   * that round already picked up (`scan()` is a live, point-in-time read of
   * current computed style, not tied to *which* mutation triggered the
   * call). A trigger that arrives *after* that scan but *while* the round
   * is still `RESOLVING` (`resolveCommitted()`'s own `install()` await
   * gives a real, if small, window — long enough for a vendor's own
   * `MutationObserver` reacting to the `data-sw-patched` write `install()`
   * just made, or any other unrelated concurrent mutation, to insert new
   * content before this round's own commit finishes) represents evidence
   * *no* scan has seen yet. `shadow-scope-discovery.ts`'s own per-root
   * observer correctly does not `invalidate()` such a trigger (state reads
   * `RESOLVING`, not `COMMITTED`/`EXONERATED_NATIVE` — invalidate would
   * throw), but it still calls `onScopeReady`/`project()` unconditionally,
   * queuing a follow-up here — bot-found, this story's own review, round 4:
   * without `forceInvalidate` below, that follow-up would find the scope
   * already `COMMITTED` by the time its own turn in the queue comes up and
   * silently no-op, permanently leaving the new content unclassified with
   * the hold already released. `project()` captures whether a round was
   * already in flight *at the moment this new trigger arrived* and passes
   * that through; `projectOnce()` uses it to force one `invalidate()` step
   * before `ensureResolving()`, so a trigger that missed the earlier scan
   * always gets a fresh one once its own turn comes, whatever state the
   * earlier round left the scope in.
   */
  const inFlight = new Map<ScopeId, Promise<void>>()

  /**
   * The vendor-invert amount each currently-`COMMITTED` scope's own
   * host-token rule was actually built against, keyed by scope id — set in
   * `projectOnce()`'s own `install()` callback below, at the exact moment
   * that value is used, and cleared in `uninstall()`, which every path that
   * takes a scope out of `COMMITTED` (`invalidate()`, `reRegister()`,
   * `retire()` — `scope-registry.ts`'s own three callers) already runs.
   * Read back by `reconcileCommittedSheets()`'s own poll, below.
   *
   * Bot-found, PR #1336's own round-2 review, on an earlier version of this
   * poll that instead compared the *current* invert amount against only a
   * single shared "as of this poll's own last tick" sample: that misses a
   * toggle-and-revert that nets to the same value across two ticks (0 -> 1
   * -> 0 inside one 250ms window, say) if some *other* event — a genuine
   * vendor mutation invalidating and recommitting this same scope, for
   * instance — commits a scope under the transient value in between. The
   * poll's own two samples read identically in that case, even though that
   * one scope's own realization was built for a value that is no longer
   * current. Comparing against what each scope was individually built
   * against, rather than one shared "did the sampled value change" flag,
   * closes that regardless of how many times the value has moved between
   * ticks.
   */
  const committedVendorInvertById = new Map<ScopeId, number>()

  /**
   * What each currently-`COMMITTED` scope last realized, so
   * `recontrastDescendants()` below can re-run its rendered-contrast half
   * against a changed ancestor without re-deriving its classification (which
   * did not change: `scan()`/`decide()` classify each element by its *own*
   * background, scope-locally, and an ancestor scope's theme has no bearing
   * on that). Set in `install()`, cleared in `uninstall()` — the same
   * lifetime `committedVendorInvertById` has, and for the same reason.
   */
  const committedRealizationById = new Map<
    ScopeId,
    CommittedShadowRealization
  >()

  /**
   * Scopes whose realization has been torn down since the last round that
   * reported for them — recorded by `uninstall()` below.
   *
   * Keyed by the root rather than the scope id, and a `WeakSet` rather than
   * a `Set`, for the reason `shadow-actuator.ts`'s own `ownedSheetsByRoot`
   * gives: `retire()` runs `uninstall()` too, and a retired scope is purged
   * and never projected again, so an id recorded there could never be
   * consumed — one retained string per formerly-committed scope, on a page
   * that churns shadow roots or toggles auto mode (bot-found, Codex's
   * confirming review of #1412). A retired root becomes unreachable along
   * with its host, so this entry goes with it and no explicit cleanup is
   * needed. A state check inside `uninstall()` could not substitute:
   * `retire()` calls it *before* its own transition, so the state still
   * reads COMMITTED there.
   *
   * `clearShadowSurfaceState`'s own return value cannot cover this on its
   * own, and the gap is not hypothetical (found while regression-testing
   * the closing review's exoneration finding): the usual path into an
   * exoneration is `invalidate()` *first* — `shadow-scope-discovery.ts`'s
   * per-root observer calls it before `onScopeReady`, and `projectScope`'s
   * own `forceInvalidate` does the same — and `invalidate()` runs
   * `uninstall()`, which already cleared everything. The exoneration branch
   * that follows then finds nothing left to clear and would report "nothing
   * moved", while the descendants resolving their backdrop into this scope
   * are stale precisely *because* that teardown happened.
   *
   * Consumed (and cleared) by whichever exit reports for the scope, so a
   * teardown is never counted twice and never dropped: a round that exits
   * without reporting — `resolveFailed`, say — leaves the flag set for the
   * next one.
   */
  const tornDownSinceReport = new WeakSet<ShadowRoot>()

  /** True when `id`'s own registered parent chain passes through `ancestorId`. */
  function isDescendantScope(id: ScopeId, ancestorId: ScopeId): boolean {
    let parent = registry.snapshot(id)?.parent
    // Bounded by the registered scope tree's depth; a cycle is impossible,
    // since `parent` is fixed at registration to an id that already existed.
    while (parent !== null && parent !== undefined) {
      if (parent === ancestorId) return true
      parent = registry.snapshot(parent)?.parent
    }
    return false
  }

  /**
   * Re-runs the rendered-contrast half for every committed scope nested
   * inside `ancestorId`, after that ancestor's own realization has landed.
   *
   * Bot-found, Codex review round 1 on this PR, and real:
   * `shadow-scope-discovery.ts`'s `registerShadowRoot` recurses into nested
   * roots (`walk`) *before* calling `onScopeReady` for the parent, so a
   * child's projection is queued first and its audit can score the ancestor's
   * still-native backdrop. `resolveEffectiveBackdrop` climbs through
   * `ShadowRoot.host` into the outer scope whenever a carrier's own
   * ancestors inside its root are all transparent, so that backdrop is
   * exactly what the ancestor is about to darken — and nothing re-audits the
   * child afterwards: the ancestor's realization is `adoptedStyleSheets`
   * writes (not DOM mutations at all) plus attribute writes *inside the
   * ancestor's* root, which neither the child's own per-root observer
   * (observers do not cross a shadow boundary) nor its host observer
   * (`class`/`style` only) can see. The carrier keeps its authored dark
   * colour on a newly dark surface, permanently.
   *
   * Deliberately re-runs only the *contrast* half, and deliberately does not
   * `invalidate()`: a descendant's own classification is unaffected by an
   * ancestor's theme (each element is classified by its own background), and
   * invalidating would re-engage that scope's occlusion hold — a visible veil
   * flash on every ancestor commit, for a scope whose background realization
   * is already correct.
   *
   * Transitive rather than direct-children-only: a grandchild's backdrop can
   * resolve through two hosts to this ancestor just as easily as one. Order
   * among descendants does not matter — no descendant's *background*
   * realization changes here, so none of them is an input to another's
   * backdrop. Each is guarded individually so one scope's failure does not
   * silently skip the rest (this runs after `resolveCommitted` has already
   * resolved, so a throw here cannot be reported as a FAILED_HELD).
   */
  function recontrastScopes(
    include: (id: ScopeId) => boolean,
    cause: string
  ): void {
    for (const otherId of registry.ids()) {
      const snapshot = registry.snapshot(otherId)
      if (snapshot?.state.kind !== "COMMITTED") continue
      const root = snapshot.ref
      if (!isShadowRoot(root)) continue
      if (!include(otherId)) continue
      const realized = committedRealizationById.get(otherId)
      if (realized === undefined) continue
      try {
        projectContrast(
          otherId,
          root,
          realized.actions,
          realized.swatch,
          realized.vendorInvert,
          onContrastAudited
        )
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          `[some-filter] re-contrast of ${otherId} after ${cause} failed:`,
          error
        )
        // Bot-found (Codex confirming review on #1443): this scope stays
        // COMMITTED on this path — projectContrast threw before its own
        // onContrastAudited call, and nothing here transitions the
        // registry — so none of content.ts's exhaustive eviction-on-
        // transition switch cases fire, and the scope's last-reported audit
        // (from before whatever repaint prompted this re-contrast) would
        // otherwise stand in as current indefinitely. Reports `null`, not
        // `[]` (bot-found, Codex confirming review round 3 on #1443: `[]`
        // is the same shape a genuinely clean audit uses, so a failed
        // re-contrast merged indistinguishably from "this scope audited
        // nothing" instead of "this scope's state is unknown") — see
        // ContrastSourceReport's own doc comment.
        onContrastAudited?.(otherId, null)
      }
    }
  }

  function recontrastDescendants(ancestorId: ScopeId): void {
    recontrastScopes(
      (id) => id !== ancestorId && isDescendantScope(id, ancestorId),
      ancestorId
    )
  }

  /**
   * One round for `id`, plus the one thing every round owes its
   * descendants.
   *
   * The re-contrast lives *here*, at the single exit, rather than at each
   * point that changes this scope's realization — and that placement is the
   * fix for a class of bug, not a style preference. It was originally a call
   * beside the commit path, which left both exoneration paths
   * (`no-swatch` and `restore-native`) tearing a realization down and
   * returning without telling anyone (bot-found, Codex's closing review of
   * #1412). Enumerating trigger sites is exactly the shape that keeps
   * missing one; `projectScope` below instead *reports* whether this round
   * moved this scope's realization, and every exit it has flows through
   * this line.
   */
  async function projectOnce(
    id: ScopeId,
    forceInvalidate: boolean
  ): Promise<void> {
    if (await projectScope(id, forceInvalidate)) recontrastDescendants(id)
  }

  /**
   * Runs one round for `id` and returns whether it actually changed this
   * scope's own realization — the signal `projectOnce` above re-contrasts
   * descendants on.
   *
   * `false` for every exit that leaves the realization exactly as it was:
   * an unregistered or non-shadow scope, a scope the custody state machine
   * will not move toward COMMITTED, a round that failed (FAILED_HELD leaves
   * the previous realization installed), an exoneration that found nothing
   * to clear, and a commit that did not land (`resolveCommitted`'s own
   * stale-completion branch, which uninstalls rather than committing).
   */
  async function projectScope(
    id: ScopeId,
    forceInvalidate: boolean
  ): Promise<boolean> {
    const snapshot = registry.snapshot(id)
    if (snapshot === undefined) return false
    const root = snapshot.ref
    if (!isShadowRoot(root)) return false

    if (forceInvalidate) {
      const state = registry.stateOf(id)
      if (state?.kind === "COMMITTED" || state?.kind === "EXONERATED_NATIVE") {
        registry.invalidate(id)
      }
    }
    if (!ensureResolving(registry, id)) return false

    // Read once per round, not once per factory call (#1281) — swatch is a
    // live source now, mirroring epoch().
    const rawSwatch = swatch()

    // Mirrors decide()'s own degenerate case (Theorem D.2's null adapter) —
    // no swatch selected means nothing to project, same reason
    // (document-scope.ts's own reportPipelineOutcome uses the identical
    // "no-swatch" reason string for the document scope's counterpart).
    // clearShadowSurfaceState() before releasing the hold: a scope that was
    // previously committed and then had its swatch turned off must not keep
    // showing its last commit's dark styling once native content is
    // revealed again.
    if (rawSwatch === null) {
      const cleared = clearShadowSurfaceState(root)
      registry.resolveExonerated(id, { proof: { reason: "no-swatch" } })
      return reportRealizationChange(root, cleared)
    }

    // The scan itself, not just decide(), is inside this try: projectOnce()
    // is invoked (via project(), below) synchronously from
    // shadow-scope-discovery.ts's own MutationObserver callback, which still
    // has its own walk(shadow, id) to run *after* this returns (nested-scope
    // discovery) — an uncaught throw here would abort that callback
    // entirely, silently breaking discovery for this whole mutation batch,
    // not just this scope's own classification (mirrors pipeline.ts's own
    // ingest()/fire() split, adapted to this module's single-call shape).
    let scanned: ScanResult
    let actions: ReadonlyArray<FilterAction>
    try {
      const hypothesis = createHypothesis<SurfaceKey, SurfaceAttr>()
      const provenance = createProvenanceStore<SurfaceKey>()
      // Both halves, because a shadow carrier's colours can come from
      // either: the document sheets (custom properties inherit across the
      // boundary, and a carrier's backdrop can resolve out into the light
      // DOM) and this scope's own adopted realization. Suppressing only the
      // document half left the scope's static layer live, so the scan read
      // this extension's own output back as vendor evidence.
      scanned = withVendorColorsVisible(() =>
        withShadowColorsVisible(root, () => scan(root))
      )
      const timestamp = Date.now()
      for (const [key, attrs] of scanned.attrsByKey) {
        update(hypothesis, provenance, {
          key,
          attrs,
          epoch: epoch(),
          tier: "full",
          timestamp,
        })
      }
      actions = invoke(hypothesis, { decide: (h) => decide(h, rawSwatch) })
    } catch (error) {
      registry.resolveFailed(id, errorReason(error))
      // FAILED_HELD leaves the previous realization installed and the hold
      // engaged — nothing moved, so no descendant is stale because of it.
      return false
    }

    if (actions.some((action) => action.kind === "restore-native")) {
      // decide()'s own already-dark verdict withholds every per-surface
      // action outright — see clearShadowSurfaceState()'s own doc comment
      // for why a prior commit's tags/colors must be explicitly cleared
      // here rather than left for a fresh tag-surface action to overwrite
      // (there isn't one, this round).
      const cleared = clearShadowSurfaceState(root)
      registry.resolveExonerated(id, {
        proof: { reason: "restore-native" },
      })
      return reportRealizationChange(root, cleared)
    }

    // Awaited, not fire-and-forget: project()'s own serialization queue
    // (this factory's inFlight map, above) depends on projectOnce()'s
    // returned promise not settling until the full two-phase handoff has —
    // see inFlight's own doc comment for the overlapping-commit race this
    // closes.
    await registry.resolveCommitted(id, {
      revision: rawSwatch.id,
      install: () => {
        tagSurfaceElements(actions, scanned.elementsByKey)
        // Not passed to decide() above: mirrors the document-level split
        // (theme-adapter.ts's decide() always runs against the raw swatch;
        // only theme-apply.ts's own injectDarkTheme() — the static
        // token-declaration layer — compensates, right before building CSS
        // text). realizeShadowColors (shadow-actuator.ts) is this scope's
        // own equivalent — it compensates both the :host token rule *and*
        // every per-surface emit-surface-color action's own colors
        // internally (bot-found, round 3: compensating only the swatch
        // left surface colors uncompensated, a worse, self-inconsistent
        // result than neither being compensated) — recomputed fresh every
        // round: a vendor's own invert toggle can flip at any time (#1281).
        const vendorInvert = detectVendorInvert()
        // SF-RC3 (#1342): the theme *and* the rendered-contrast channel, in
        // one call — see projectContrast's own doc comment for the ordering
        // (the audit must read post-actuation computed style) and for why
        // this scope's own prior repairs are dropped before it reads.
        projectContrast(
          id,
          root,
          actions,
          rawSwatch,
          vendorInvert,
          onContrastAudited
        )
        // Recorded so a later ancestor commit can re-audit this scope
        // without re-deriving its classification — recontrastDescendants,
        // below. Cleared in uninstall alongside the invert amount.
        committedRealizationById.set(id, {
          actions,
          swatch: rawSwatch,
          vendorInvert,
        })
        // Recorded so reconcileCommittedSheets()'s own poll can later tell
        // whether *this* commit's own compensation has gone stale, rather
        // than only comparing against whatever the poll itself last
        // sampled (committedVendorInvertById's own doc comment, above, has
        // the bot-found race this closes).
        committedVendorInvertById.set(id, vendorInvert)
      },
      // Only reachable once this scope has actually been COMMITTED
      // (scope-registry.ts's invalidate()/retire() are the two callers —
      // see their own doc comments): the hold is re-engaged (invalidate) or
      // released permanently (retire) independently of this callback, so
      // there is no visible window either way. Clearing here is mostly
      // belt-and-suspenders — the next round's own project() call
      // self-heals a re-commit (tagSurfaceElements/realizeShadowColors both
      // key off the *current* actions, not an incremental diff) and an
      // exoneration explicitly clears via clearShadowSurfaceState() above —
      // but retire() never calls project() again for this id, so this is
      // the only cleanup a permanently-removed scope ever gets.
      uninstall: () => {
        if (clearShadowSurfaceState(root)) tornDownSinceReport.add(root)
        committedVendorInvertById.delete(id)
        committedRealizationById.delete(id)
      },
    })

    // Only a handoff that actually landed COMMITTED counts — the
    // stale-completion branch (`resolveCommitted`'s own generation check)
    // resolves without committing and has just had its realization
    // uninstalled by whichever concurrent call superseded it, and that call
    // reports for itself.
    return reportRealizationChange(
      root,
      registry.stateOf(id)?.kind === "COMMITTED"
    )
  }

  /**
   * Folds in any teardown `uninstall()` recorded for `root` and clears it,
   * so one round reports it exactly once. `changed` is what this round
   * itself observed.
   */
  function reportRealizationChange(
    root: ShadowRoot,
    changed: boolean
  ): boolean {
    return tornDownSinceReport.delete(root) || changed
  }

  function project(id: ScopeId): void {
    // Captured now, synchronously, before queuing this call: true exactly
    // when another round for this same id is already queued or running —
    // the condition projectOnce()'s own forceInvalidate parameter (its
    // doc comment above) needs to tell "genuinely redundant, already-seen
    // evidence" apart from "arrived after that round's own scan, needs a
    // fresh one regardless of what state that round settles into."
    const wasInFlight = inFlight.has(id)
    const prior = inFlight.get(id) ?? Promise.resolve()
    // A prior round's own rejection (projectOnce() itself never throws —
    // every fallible step resolves the scope to FAILED_HELD instead — but
    // defend the queue's own continuity regardless of what future code
    // does) must not abort every future call chained onto this same id.
    const current = prior
      .catch(() => {})
      .then(() => projectOnce(id, wasInFlight))
    inFlight.set(id, current)
    void current
      .catch(() => {})
      .finally(() => {
        if (inFlight.get(id) === current) inFlight.delete(id)
      })
  }

  /**
   * #1280/#1281's own poll body: for every currently `COMMITTED` shadow
   * scope whose realization either (a) a vendor's own wholesale
   * `adoptedStyleSheets` reassignment has silently broken, or (b) the
   * page's own vendor-invert amount no longer matches what that scope's own
   * host-token rule was built against, force the same repair a genuine
   * vendor mutation would (`shadow-scope-discovery.ts`'s per-root observer:
   * `registry.invalidate(id)` then `onScopeReady`/`project(id)`) —
   * invalidate re-engages the hold and tears down the now-stale realization
   * synchronously; the immediate `project()` call that follows reads the
   * fresh `RESOLVING` state (`ensureResolving`'s own no-throw case for it)
   * and runs a full scan/decide/realize round, re-adopting every sheet this
   * scope actually needs, recompensated against the current invert amount.
   * A scope still `RESOLVING`/`HELD`/`FAILED_HELD` at poll time has nothing
   * committed to have gone stale, and `snapshot(id)` reads live state, so
   * there is no race between this synchronous sweep and any single
   * in-flight `project()` round — one or the other completes first, never
   * both interleaved.
   *
   * `detectVendorInvert()` is read once per tick, not once per scope — it is
   * a single document-wide value, the same reason `injectDarkTheme()`
   * itself only ever reads it once per document-level round rather than per
   * surface.
   */
  function reconcileCommittedSheets(): void {
    const currentVendorInvert = detectVendorInvert()

    for (const id of registry.ids()) {
      const snapshot = registry.snapshot(id)
      if (snapshot === undefined) continue
      const root = snapshot.ref
      if (!isShadowRoot(root) || snapshot.state.kind !== "COMMITTED") continue
      const committedVendorInvert = committedVendorInvertById.get(id)
      const invertStale =
        committedVendorInvert !== undefined &&
        committedVendorInvert !== currentVendorInvert
      if (!invertStale && shadowRealizationIntact(root)) continue
      registry.invalidate(id)
      project(id)
    }
  }

  let pollHandle: ReturnType<typeof setInterval> | null = null

  return {
    project,
    recontrastAll(): void {
      // Every committed shadow scope, not a subtree: `r_0` is the one
      // ancestor every scope has, at every nesting depth, so a document
      // realization can change the backdrop of a carrier in any of them.
      recontrastScopes(() => true, "the document scope")
    },
    observe(): void {
      if (pollHandle !== null) return
      // Lifetime: identical to shadow-scope-discovery.ts's own poll —
      // started by observe() from runAutoTheme(), stopped by teardown() on a
      // mode change, on pagehide, and whenever the tab goes hidden
      // (content.ts's suspendAutoWatchers).
      // eslint-disable-next-line extension-charter/require-named-lifetime -- lifetime stated above
      pollHandle = setInterval(
        reconcileCommittedSheets,
        SHEET_INTEGRITY_POLL_MS
      )
    },
    teardown(): void {
      if (pollHandle !== null) {
        clearInterval(pollHandle)
        pollHandle = null
      }
    },
  }
}
