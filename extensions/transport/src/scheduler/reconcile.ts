/**
 * §8's operational semantics leave "when does (PLAN) run" implicit; this
 * module is where that cadence actually lives — a trigger coalescer that
 * batches/debounces ingestion bursts before invoking the Adapter. The
 * canon takes no position on the "correct" cadence, only that one must be
 * declared (§8.3's conformance checklist), so no default is hard-coded
 * here. No decision logic lives in this module — only *when* to ask the
 * Adapter, never *what* to ask it.
 */

export type ReconcilePolicy = {
  /** A burst of triggers within this window (ms) coalesces into one invocation. */
  readonly debounceMs: number
}

export type TimerHandle = ReturnType<typeof setTimeout>

export type SchedulerPrimitives = {
  readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle
  readonly clearTimer: (handle: TimerHandle) => void
}

const defaultPrimitives: SchedulerPrimitives = {
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle),
}

export type Coalescer = {
  /** Signals that new evidence arrived; coalesces bursts per the configured policy. */
  trigger(): void
  /** Cancels any pending coalesced invocation and releases its timer. */
  dispose(): void
}

export function createCoalescer(
  policy: ReconcilePolicy,
  onFire: () => void,
  primitives: SchedulerPrimitives = defaultPrimitives
): Coalescer {
  let pending: TimerHandle | undefined

  return {
    trigger(): void {
      if (pending !== undefined) {
        primitives.clearTimer(pending)
      }
      pending = primitives.setTimer(() => {
        pending = undefined
        onFire()
      }, policy.debounceMs)
    },
    dispose(): void {
      if (pending !== undefined) {
        primitives.clearTimer(pending)
        pending = undefined
      }
    },
  }
}
