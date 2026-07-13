/**
 * Definition 5.1 (Hypothesis) — canon §5.1.
 *
 * The concrete, mutable realization of `contracts/hypothesis.ts`'s
 * read-only `Hypothesis<K, Attr>` query surface. `⊥` ("no evidence yet")
 * is modeled as key-absence — never as a stored `undefined` — so `has()`
 * and `get()` always agree.
 */

import type { Hypothesis } from "../contracts/hypothesis"

export type MutableHypothesis<K, Attr> = Hypothesis<K, Attr> & {
  set(key: K, value: Attr): void
  delete(key: K): void
}

export function createHypothesis<K, Attr>(): MutableHypothesis<K, Attr> {
  const store = new Map<K, Attr>()

  return {
    get(key: K): Attr | undefined {
      return store.get(key)
    },
    has(key: K): boolean {
      return store.has(key)
    },
    keys(): Iterable<K> {
      return store.keys()
    },
    set(key: K, value: Attr): void {
      store.set(key, value)
    },
    delete(key: K): void {
      store.delete(key)
    },
  }
}
