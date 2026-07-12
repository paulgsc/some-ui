/**
 * Theorem D.2 (Kernel Independence) — canon §D.1.
 *
 * `decide_0(h) = ∅` for every `h`. This is the reference adapter this
 * package's own build, lint, and conformance suite (S11) run against —
 * the transport kernel must type-check, lint, and pass its full suite
 * with no business logic anywhere in the tree, and this is the trivial
 * inhabitant of the `Adapter` contract that proves it.
 */

import type { Action } from "../contracts/action"
import type { Adapter } from "../contracts/adapter"

export function createNullAdapter<
  K,
  Attr,
  A extends Action = Action,
>(): Adapter<K, Attr, A> {
  return {
    decide(): ReadonlyArray<A> {
      return []
    },
  }
}
