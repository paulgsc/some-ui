/**
 * Definition 3.3 (Hybrid channel) — canon §3. `SS = SS_event ∪ SS_poll`,
 * exposed to the Estimator (S6) as a single token queue. This module owns
 * nothing beyond token production: it never interprets or reorders what it
 * holds (that ordering is Definition 5.2's job, not this queue's).
 */

import type { SensedToken } from "./observer"

export type TokenQueue<K, Attr> = {
  readonly length: number
  push(token: SensedToken<K, Attr>): void
  /** Removes and returns every token currently queued, in arrival order. */
  drain(): Array<SensedToken<K, Attr>>
}

export function createTokenQueue<K, Attr>(): TokenQueue<K, Attr> {
  const queue: Array<SensedToken<K, Attr>> = []

  return {
    get length(): number {
      return queue.length
    },
    push(token: SensedToken<K, Attr>): void {
      queue.push(token)
    },
    drain(): Array<SensedToken<K, Attr>> {
      return queue.splice(0, queue.length)
    },
  }
}

export type HybridChannel<K, Attr> = {
  /** The merged `SS_event ∪ SS_poll` token stream. Both sub-channels' `emit` push here. */
  readonly queue: TokenQueue<K, Attr>
}

export function createHybridChannel<K, Attr>(): HybridChannel<K, Attr> {
  return { queue: createTokenQueue<K, Attr>() }
}
