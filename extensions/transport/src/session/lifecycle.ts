/**
 * SessionLifecycle — canon §5.4 (Definition 5.4), §D.0 (Definition D.1,
 * Theorem D.1).
 *
 * Distinguishes the two reset paths Theorem D.1 names: "content-only reset"
 * (case (a) — a same-document navigation ends the content lifetime L_C and
 * begins a new L_C' while the document lifetime L_D, and Bootstrap with it,
 * persists) from "full reset" (case (b) — a refresh ends L_D itself, which
 * re-triggers Bootstrap per S2/S10). Both paths advance the epoch exactly
 * once via the same underlying counter, so there is a single source of
 * truth for both of Theorem D.1's cases.
 *
 * This module has no opinion on *when* either path fires — no History API
 * patching, no vendor navigation event, no MutationObserver. A caller wires
 * whatever navigation-detection heuristic it needs and calls `resetContent`
 * or `resetDocument` directly; that is the entire injection surface
 * (Remark 1.4: nothing here may depend on a specific vendor).
 *
 * `onReset` lets the Estimator (S6) clear whatever per-epoch state it
 * attaches, without Session importing anything from `estimator/`.
 */

import { createEpochCounter, type Epoch, type EpochCounter } from "./epoch"

export type ResetKind = "content" | "document"

export type SessionResetEvent = {
  readonly kind: ResetKind
  readonly epoch: Epoch
}

export type SessionLifecycle = {
  readonly epoch: Epoch
  resetContent(): SessionResetEvent
  resetDocument(): SessionResetEvent
}

export type CreateSessionLifecycleOptions = {
  readonly onReset?: (event: SessionResetEvent) => void
  readonly counter?: EpochCounter
}

export function createSessionLifecycle(
  options: CreateSessionLifecycleOptions = {}
): SessionLifecycle {
  const counter = options.counter ?? createEpochCounter()
  const onReset = options.onReset

  function performReset(kind: ResetKind): SessionResetEvent {
    const epoch = counter.reset()
    const event: SessionResetEvent = { kind, epoch }
    onReset?.(event)
    return event
  }

  return {
    get epoch(): Epoch {
      return counter.current
    },
    resetContent(): SessionResetEvent {
      return performReset("content")
    },
    resetDocument(): SessionResetEvent {
      return performReset("document")
    },
  }
}
