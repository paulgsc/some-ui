/**
 * Definition 5.4 (Epoch) — canon §5.4.
 *
 * An epoch is a monotonically increasing counter, advanced only by a
 * distinguished reset operator (⊥_ε per Definition 5.4) that begins a fresh
 * epoch. There is no public setter: `reset()` is the only exported mutator,
 * and `EpochCounter.current` is a read-only accessor.
 */

export type Epoch = number

export function initialEpoch(): Epoch {
  return 0
}

export type EpochCounter = {
  readonly current: Epoch
  reset(): Epoch
}

export function createEpochCounter(
  initial: Epoch = initialEpoch()
): EpochCounter {
  let value = initial
  return {
    get current(): Epoch {
      return value
    },
    reset(): Epoch {
      value = value + 1
      return value
    },
  }
}
