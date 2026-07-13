/**
 * Definition D.3 (Business Adapter), Axiom D.1 (Adapter purity) — canon §D.1.
 *
 * The single call site that hands `Ĥ` to an injected `decide` and returns
 * `Fin(A)` to the Scheduler/Actuator (S8/S9). This is the only file in the
 * transport package permitted to hold a reference to a concrete adapter
 * instance at runtime — every other module is typed against the `Adapter`
 * interface only (Corollary D.2.1), and receives an implementation solely
 * via this function's `adapter` parameter, never by importing one.
 */

import type { Action } from "../contracts/action"
import type { Adapter } from "../contracts/adapter"
import type { Hypothesis } from "../contracts/hypothesis"

export function invoke<K, Attr, A extends Action = Action>(
  hypothesis: Hypothesis<K, Attr>,
  adapter: Adapter<K, Attr, A>
): ReadonlyArray<A> {
  return adapter.decide(hypothesis)
}
