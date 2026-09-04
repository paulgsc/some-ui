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
  tagSurfaceElements,
} from "./shadow-actuator"
import type { Swatch } from "./swatches"
import { decide } from "./theme-adapter"

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

export function createShadowScopeTheming(
  registry: ShadowSceneRegistry,
  swatch: Swatch | null,
  epoch: () => Epoch
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

  async function projectOnce(
    id: ScopeId,
    forceInvalidate: boolean
  ): Promise<void> {
    const snapshot = registry.snapshot(id)
    if (snapshot === undefined) return
    const root = snapshot.ref
    if (!isShadowRoot(root)) return

    if (forceInvalidate) {
      const state = registry.stateOf(id)
      if (state?.kind === "COMMITTED" || state?.kind === "EXONERATED_NATIVE") {
        registry.invalidate(id)
      }
    }
    if (!ensureResolving(registry, id)) return

    // Mirrors decide()'s own degenerate case (Theorem D.2's null adapter) —
    // no swatch selected means nothing to project, same reason
    // (document-scope.ts's own reportPipelineOutcome uses the identical
    // "no-swatch" reason string for the document scope's counterpart).
    // clearShadowSurfaceState() before releasing the hold: a scope that was
    // previously committed and then had its swatch turned off must not keep
    // showing its last commit's dark styling once native content is
    // revealed again.
    if (swatch === null) {
      clearShadowSurfaceState(root)
      registry.resolveExonerated(id, { proof: { reason: "no-swatch" } })
      return
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
      scanned = withVendorColorsVisible(() => scan(root))
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
      actions = invoke(hypothesis, { decide: (h) => decide(h, swatch) })
    } catch (error) {
      registry.resolveFailed(id, errorReason(error))
      return
    }

    if (actions.some((action) => action.kind === "restore-native")) {
      // decide()'s own already-dark verdict withholds every per-surface
      // action outright — see clearShadowSurfaceState()'s own doc comment
      // for why a prior commit's tags/colors must be explicitly cleared
      // here rather than left for a fresh tag-surface action to overwrite
      // (there isn't one, this round).
      clearShadowSurfaceState(root)
      registry.resolveExonerated(id, {
        proof: { reason: "restore-native" },
      })
      return
    }

    // Awaited, not fire-and-forget: project()'s own serialization queue
    // (this factory's inFlight map, above) depends on projectOnce()'s
    // returned promise not settling until the full two-phase handoff has —
    // see inFlight's own doc comment for the overlapping-commit race this
    // closes.
    await registry.resolveCommitted(id, {
      revision: swatch.id,
      install: () => {
        tagSurfaceElements(actions, scanned.elementsByKey)
        realizeShadowColors(actions, root, swatch)
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
        clearShadowSurfaceState(root)
      },
    })
  }

  return {
    project(id: ScopeId): void {
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
    },
  }
}
