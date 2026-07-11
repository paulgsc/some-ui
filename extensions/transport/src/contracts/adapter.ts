import type { Action } from "./action"
import type { Hypothesis } from "./hypothesis"

/**
 * Definition D.3 (Business Adapter) — canon §D.1.
 *
 * The sole domain-specific extension point. `decide` is a pure function
 * (Axiom D.1): total, referentially transparent, and forbidden from
 * mutating the hypothesis, the token queue, the epoch, or `G_t`. Its return
 * value is a description of desired actions only — nothing else in this
 * package is permitted to hold a reference to a concrete implementation of
 * this interface (Corollary D.2.1).
 */
export type Adapter<K, Attr, A extends Action = Action> = {
  decide(hypothesis: Hypothesis<K, Attr>): ReadonlyArray<A>
}
