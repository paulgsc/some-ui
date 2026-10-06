/**
 * Wires the document — the root rendering scope `r_0` (Definition D.4) —
 * into the scope registry as the custody law governing the veil-teardown
 * decision. Corollary D.1.1 ("Bootstrap is Axiom C.1's day-zero case").
 *
 * `createPrepaintCustody()` is a thin `CustodyPrimitive` adapter over the
 * *existing* veil (`enablePrepaint`/`disablePrepaint`), not a second
 * self-healing occlusion; `createOcclusionHold` is for shadow scopes, which
 * have no pre-existing veil, and reusing it here would run two self-healing
 * veils over one document.
 *
 * Deliberately narrow: only auto mode's decide/realize outcome (and the
 * enforcement handshake) routes through the registry, so a thrown round
 * holds the veil instead of reading as "nothing to apply". Legacy/off and
 * the `yt-navigate-*`/`pagehide` handlers still touch the veil directly.
 *
 * Every caller touching the veil from outside the registry must call
 * `reengage()`, for two reasons:
 *
 *   - Off mode's `disablePrepaint()` releases the hold without telling the
 *     registry, which still believes e.g. `HELD`; re-entering auto unreconciled
 *     would run the first round physically uncovered.
 *   - A cache-only reset is not enough: a `resolveCommitted()` can be in
 *     flight on its atomic-swap gate when nav-start or the watchdog re-arms
 *     the veil. Only a real transition bumps the per-scope `generation` that
 *     the in-flight call checks, so without it the stale completion tears the
 *     fresh veil down.
 *
 * `reengage()` drives `reRegister()`, legal from every resting state
 * including `RESOLVING`, which re-installs the hold and bumps generation in
 * one synchronous call.
 *
 * Legacy's own `commitVisualState()` teardown has no generation counter; it
 * is guarded one layer down by `prepaint.ts`'s `commitToken`, which every
 * `enablePrepaint()` (including `reengage()`'s) bumps.
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

/** `Pi`: why the document was exonerated — a data witness only (`NativeExoneration`), never installed or uninstalled. */
export type DocumentExonerationProof = { readonly reason: string }

export type DocumentScopeRegistry = ScopeRegistry<
  DocumentRevision,
  DocumentExonerationProof
>

/**
 * A `CustodyPrimitive` over the existing prepaint veil. Holds no state:
 * `prepaint.ts`'s veil element/class stay the only source of truth.
 */
export function createPrepaintCustody(): CustodyPrimitive {
  return {
    install: enablePrepaint,
    release: disablePrepaint,
  }
}

/**
 * `commitVisualState()`'s atomic-swap timing (two rAFs, or the
 * `COMMIT_FALLBACK_MS` fallback for an occluded tab) as a `Promise`, so
 * `resolveCommitted()` can await it *before* releasing the hold. Not a
 * refactor of `commitVisualState()`: its callers and tests depend on it
 * completing synchronously when rAF is stubbed.
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
 * The pipeline's per-round result, distinguishing "decided, nothing to
 * apply" (`restore-native`, or no swatch) from "the round threw". Only the
 * first may exonerate the document; the second must hold it.
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
 * Whether routing `outcome` would change the document scope's resting state.
 * `fire()` runs on every reactive round, most reasserting an unchanged
 * verdict; a full invalidate/resolve cycle for each would re-engage and
 * release the hold every time — a self-inflicted flicker (#831).
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
 * Drives `id` from its resting state to RESOLVING along Definition D.5's
 * legal path. Only `EXONERATED_NATIVE` needs two calls: `invalidate()` from
 * there lands `HELD`, not `RESOLVING` (see `InvalidateEvent`).
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
   * the veil `prepaint-start.js` already put up, so `hold.install()` is a
   * no-op write. Idempotent.
   */
  registerDocument(contentEpoch: Epoch): void

  /**
   * Routes one pipeline round's outcome through the registry's transitions.
   * A thrown `decide()`/`realize()` produces `FAILED_HELD` (veil held), not
   * an exoneration.
   */
  reportPipelineOutcome(outcome: FireOutcome): void

  /**
   * The enforcement sheet's counterpart to `reportPipelineOutcome()`.
   * `confirmed` commits exactly as an `activate-theme` round does (including
   * `awaitAtomicSwap()`'s two frames under the veil). `timeout` exonerates,
   * releasing the veil onto the native page: never a permanent blackout, and
   * never read as evidence the sheet landed.
   */
  reportEnforcement(
    result:
      | { readonly kind: "confirmed"; readonly swatchId: string }
      | { readonly kind: "timeout" }
  ): void

  /**
   * Reconciles the registry with a veil touch it does not own (nav-start,
   * the watchdog's `repairDarkDesync()`, `runAutoTheme()` after off mode).
   * Drives `reRegister()`: its `hold.install()` re-asserts the veil and its
   * state change bumps `generation`, so an in-flight `resolveCommitted()`
   * backs off instead of releasing this hold. Also clears the idempotency
   * cache, since the fresh `HELD` matches no cached verdict. A cold call is a
   * DOM no-op. See the header.
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
      const reason =
        outcome.kind === "ok" &&
        outcome.actions.some((action) => action.kind === "restore-native")
          ? "restore-native"
          : "no-swatch"
      route(signatureOf(outcome), reason)
    },

    reportEnforcement(result): void {
      route(
        result.kind === "confirmed"
          ? { kind: "committed", swatchId: result.swatchId }
          : { kind: "exonerated" },
        "enforcement-timeout"
      )
    },

    reengage(contentEpoch: Epoch): void {
      registry.reRegister(DOCUMENT_SCOPE_ID, contentEpoch)
      lastSignature = null
    },
  }

  function route(signature: OutcomeSignature, exoneration: string): void {
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
          // No registry-owned DOM effect to undo: the theme stylesheet is
          // realize()'s concern, and the veil is the hold, re-engaged by
          // invalidate()/reRegister().
        },
      })
      return
    }

    if (signature.kind === "failed") {
      registry.resolveFailed(DOCUMENT_SCOPE_ID, signature.reason)
      return
    }

    // exonerated — release is immediate: Definition D.5's resolveExonerated
    // has no successor artifact to let land before revealing.
    registry.resolveExonerated(DOCUMENT_SCOPE_ID, {
      proof: { reason: exoneration },
    })
  }
}
