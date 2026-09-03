/**
 * Wires the document — the root rendering scope `r_0` (Definition D.4) —
 * into SF-RG's scope registry (#1265) as the custody law governing
 * `prepaint.ts`'s veil-teardown decision. SF-BS, #1266; Corollary D.1.1
 * ("Bootstrap is Axiom C.1's day-zero case").
 *
 * `prepaint-start.js`/`prepaint.css`'s own mechanics (popover promotion,
 * the `sw-dirty` CSS backstop, the self-healing re-insertion observer) are
 * untouched by this module — `createPrepaintCustody()` below is a thin
 * `CustodyPrimitive` adapter over the *existing* veil
 * (`enablePrepaint`/`disablePrepaint`), not a second, independently
 * self-healing occlusion. `custody-primitive.ts`'s `createOcclusionHold`
 * stays reserved for a scope with no pre-existing document-level veil to
 * reuse (SF-DC's shadow scopes) — reusing it here would run two
 * self-healing veils over the same document at once.
 *
 * Scope is deliberately narrow, matching #1266's own acceptance criteria:
 * only the auto-mode pipeline's decide/realize outcome
 * (`pipeline.ts`'s `FireOutcome`) is routed through the registry here.
 * Legacy/off-mode's own direct `applyTheme`/`disablePrepaint` calls, and the
 * `yt-navigate-*`/`pagehide` handlers' own veil calls, are unchanged — the
 * registry does not yet own every path that can touch the veil, only the
 * one this story's fail-open gap (content.ts's onFire collapsing "no
 * activate-theme action" into a single disablePrepaint() branch,
 * indistinguishable from a thrown/failed round) is about.
 *
 * That narrowness has a sharp edge every caller touching the physical veil
 * from outside this registry must close: `reengage()`. Two motivating bugs,
 * both found by this repo's bot reviewer on this same PR:
 *
 *   - Off-mode's own direct `disablePrepaint()` call physically releases the
 *     hold with no way to tell this registry, which keeps believing
 *     whatever resting state it was last in (typically still `HELD` from
 *     registration). Re-entering auto mode without reconciling that would
 *     run the very first classification round physically uncovered while
 *     the registry's states all assert a held page.
 *   - A cache-only reset (this module's own, deliberately removed, first
 *     attempt at this fix) is not enough on its own: `reportPipelineOutcome`'s
 *     `resolveCommitted()` call can still be in flight, awaiting its
 *     atomic-swap gate (up to `COMMIT_FALLBACK_MS`), when
 *     `yt-navigate-start` or the watchdog's repair re-arms the veil. Only a
 *     real registry transition bumps `scope-registry.ts`'s own per-scope
 *     `generation` counter — the *only* thing that in-flight
 *     `resolveCommitted()` call checks before releasing the hold on
 *     completion. Without that bump, the stale completion sails past its
 *     own staleness check and tears the freshly re-armed veil back down
 *     once its gate fires, before the fresh round it should be waiting for
 *     ever runs.
 *
 * `reengage()` fixes both by always driving `scope-registry.ts`'s own
 * `reRegister()` transition — legal from every resting state including
 * `RESOLVING`, and the one operation that both re-installs the hold *and*
 * bumps generation in the same synchronous call — rather than a bespoke,
 * weaker "just forget what I cached" primitive.
 */

import {
  COMMIT_FALLBACK_MS,
  disablePrepaint,
  enablePrepaint,
} from "@filter/lib/content/prepaint"
import type { Epoch } from "@some-extension/transport/session/epoch"

import type { FilterAction } from "./contracts"
import {
  createScopeRegistry,
  type CustodyPrimitive,
  type ScopeRegistration,
  type ScopeRegistry,
} from "./scope-registry"

/** Definition D.4's root scope `r_0`. There is only ever one — the document. */
export const DOCUMENT_SCOPE_ID = "r_0"

/** `Rho`: the committed swatch id (`ActivateThemeAction.swatchId`). */
export type DocumentRevision = string

/** `Pi`: why the document was exonerated — a data witness only (per `NativeExoneration`'s own doc comment), never installed or uninstalled. */
export type DocumentExonerationProof = { readonly reason: string }

export type DocumentScopeRegistry = ScopeRegistry<
  DocumentRevision,
  DocumentExonerationProof
>

/**
 * A `CustodyPrimitive` over the existing prepaint veil. Holds no state of
 * its own — `prepaint.ts`'s own module-level veil element/class stay the
 * only source of truth, exactly as #1266 requires ("this story only changes
 * what *decides* when to call them, not how they work").
 */
export function createPrepaintCustody(): CustodyPrimitive {
  return {
    install: enablePrepaint,
    release: disablePrepaint,
  }
}

/**
 * `prepaint.ts`'s own `commitVisualState()` atomic-swap timing (two rAFs,
 * or `COMMIT_FALLBACK_MS`'s fallback timer for an occluded tab — see that
 * module's header) as a standalone `Promise`, so `resolveCommitted()`'s
 * two-phase handoff can await it *before* releasing the hold, rather than
 * as a side effect bundled into the veil-removal call itself. Deliberately
 * not a refactor of `commitVisualState()` itself: that function's callers
 * (and its own tests) depend on its synchronous-when-rAF-is-stubbed
 * completion, which chaining through a `Promise` would turn into an extra
 * microtask hop — a real, if tiny, timing change this story does not need
 * to make.
 */
function awaitAtomicSwap(): Promise<void> {
  return new Promise((resolve) => {
    let dropped = false
    const drop = (): void => {
      if (dropped) return
      dropped = true
      resolve()
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(drop)
    })
    setTimeout(drop, COMMIT_FALLBACK_MS)
  })
}

/**
 * `pipeline.ts`'s per-round result, distinguishing "decided, nothing to
 * apply" (a genuine verdict — `restore-native`, or no swatch selected) from
 * "the round threw" — the distinction #1266's fail-open gap is about. Only
 * the first should ever exonerate the document; the second must hold it.
 */
export type FireOutcome =
  | { readonly kind: "ok"; readonly actions: ReadonlyArray<FilterAction> }
  | { readonly kind: "error"; readonly error: unknown }

type OutcomeSignature =
  | { readonly kind: "committed"; readonly swatchId: string }
  | { readonly kind: "exonerated" }
  | { readonly kind: "failed"; readonly reason: string }

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function signatureOf(outcome: FireOutcome): OutcomeSignature {
  if (outcome.kind === "error") {
    return { kind: "failed", reason: errorReason(outcome.error) }
  }
  const activate = outcome.actions.find(
    (action) => action.kind === "activate-theme"
  )
  if (activate !== undefined) {
    return { kind: "committed", swatchId: activate.swatchId }
  }
  return { kind: "exonerated" }
}

/**
 * Whether routing `outcome` would actually change the document scope's
 * resting state — mirrors `commitVisualState()`/`disablePrepaint()`'s own
 * long-standing idempotency guards (#831): pipeline.ts's `fire()` runs on
 * *every* reactive round, most of which reassert an unchanged verdict, and
 * driving the registry through a full invalidate/resolve cycle for each one
 * would re-engage and release the hold every time — a self-inflicted flicker
 * with no vendor change behind it, the same failure class those guards
 * exist to prevent.
 */
function sameSignature(a: OutcomeSignature, b: OutcomeSignature): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "committed" && b.kind === "committed") {
    return a.swatchId === b.swatchId
  }
  if (a.kind === "failed" && b.kind === "failed") {
    return a.reason === b.reason
  }
  return true
}

/**
 * Drives `id` from whatever resting state it is currently in to RESOLVING —
 * Definition D.5's legal path for each starting kind. Only `EXONERATED_NATIVE`
 * needs two calls: `invalidate()` from that state lands `HELD`, not
 * `RESOLVING` (Definition D.5 gives `invalidate` two different targets
 * depending on the current state — see `scope-registry.ts`'s own doc
 * comment on `InvalidateEvent`).
 */
function ensureResolving(registry: DocumentScopeRegistry, id: string): void {
  const state = registry.stateOf(id)
  switch (state?.kind) {
    case "HELD": {
      registry.startResolving(id)
      return
    }
    case "FAILED_HELD": {
      registry.retry(id)
      return
    }
    case "COMMITTED": {
      registry.invalidate(id) // -> RESOLVING directly
      return
    }
    case "EXONERATED_NATIVE": {
      registry.invalidate(id) // -> HELD
      registry.startResolving(id) // -> RESOLVING
      return
    }
    case "RESOLVING": {
      return
    }
    case "RETIRED":
    case undefined: {
      throw new Error(
        `[document-scope] cannot resolve an unregistered/retired scope: ${id}`
      )
    }
    default: {
      const exhaustive: never = state
      throw new Error(
        `[document-scope] unhandled state: ${JSON.stringify(exhaustive)}`
      )
    }
  }
}

export type DocumentScopeCustodian = {
  readonly registry: DocumentScopeRegistry

  /**
   * Corollary D.1.1's day-zero case: registers `document` `HELD`, matching
   * the veil `prepaint-start.js` already put up at `document_start` — by
   * the time content.ts (this module's only caller) runs, that veil already
   * exists, so `register()`'s own `hold.install()` is a no-op write, not a
   * fresh paint. Idempotent — a second call is a no-op, so callers do not
   * need to track whether this already ran.
   */
  registerDocument(contentEpoch: Epoch): void

  /**
   * Routes one pipeline round's outcome through the registry's transition
   * functions instead of a caller branching on `actions` directly — #1266's
   * own acceptance criterion. A thrown `decide()`/`realize()` now produces
   * `FAILED_HELD` (veil held, never released) rather than being
   * indistinguishable from a genuine "nothing to apply" verdict.
   */
  reportPipelineOutcome(outcome: FireOutcome): void

  /**
   * Reconciles this registry with a physical veil touch it does not own:
   * `yt-navigate-start`'s own direct `enablePrepaint()` call, the coverage
   * watchdog's `repairDarkDesync()` repair, and content.ts's own
   * `runAutoTheme()` recovering from off-mode's `disablePrepaint()` all call
   * this. Drives `scope-registry.ts`'s `reRegister()` transition — legal
   * from every resting state including `RESOLVING` — whose `hold.install()`
   * side effect re-asserts the veil and whose synchronous state mutation
   * bumps this scope's `generation` counter, invalidating any
   * `resolveCommitted()` call still in flight so its eventual completion
   * backs off (uninstalling its own now-orphaned realization) instead of
   * releasing the hold this call just re-engaged. Also clears
   * `reportPipelineOutcome()`'s own idempotency cache, since `reRegister()`
   * always produces a fresh `HELD` no prior cached verdict describes.
   *
   * A cold call (nothing has released the hold and nothing is in flight)
   * makes `hold.install()` a no-op DOM-wise — idempotent, so the cost is
   * paid only when there is actually something to reconcile. See this
   * module's own header for the two bugs a weaker, cache-only version of
   * this method (since removed) left open.
   */
  reengage(contentEpoch: Epoch): void
}

export function createDocumentScopeCustodian(
  registry: DocumentScopeRegistry = createScopeRegistry()
): DocumentScopeCustodian {
  let lastSignature: OutcomeSignature | null = null

  return {
    registry,

    registerDocument(contentEpoch: Epoch): void {
      if (registry.isRegistered(DOCUMENT_SCOPE_ID)) return
      const registration: ScopeRegistration = {
        ref: document,
        parent: null,
        contentEpoch,
        hold: createPrepaintCustody(),
      }
      registry.register(DOCUMENT_SCOPE_ID, registration)
    },

    reportPipelineOutcome(outcome: FireOutcome): void {
      const signature = signatureOf(outcome)
      if (lastSignature !== null && sameSignature(lastSignature, signature)) {
        return
      }
      lastSignature = signature
      ensureResolving(registry, DOCUMENT_SCOPE_ID)

      if (signature.kind === "committed") {
        void registry.resolveCommitted(DOCUMENT_SCOPE_ID, {
          revision: signature.swatchId,
          install: () => awaitAtomicSwap(),
          uninstall: () => {
            // No registry-owned DOM effect to undo: the actual theme
            // stylesheet is realize()'s/theme-apply.ts's concern, outside
            // this story's scope (see this module's header). The veil
            // itself is the hold, re-engaged by invalidate()/reRegister()
            // separately from this callback.
          },
        })
        return
      }

      if (signature.kind === "failed") {
        registry.resolveFailed(DOCUMENT_SCOPE_ID, signature.reason)
        return
      }

      // exonerated — release is immediate (Definition D.5's
      // resolveExonerated has no successor artifact to install first), not
      // gated on the atomic-swap wait: there is no new CSS to let land
      // before revealing, only native content that was already correct.
      const reason =
        outcome.kind === "ok" &&
        outcome.actions.some((action) => action.kind === "restore-native")
          ? "restore-native"
          : "no-swatch"
      registry.resolveExonerated(DOCUMENT_SCOPE_ID, { proof: { reason } })
    },

    reengage(contentEpoch: Epoch): void {
      registry.reRegister(DOCUMENT_SCOPE_ID, contentEpoch)
      lastSignature = null
    },
  }
}
