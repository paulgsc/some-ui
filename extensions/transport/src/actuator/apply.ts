/**
 * §8 operational semantics (the (ACT) rule), Definition 7.3 — canon §7–§8.
 *
 * Realizes `α(Δ)`: applies every action the Adapter (S7) produced and
 * self-tags every element it touches (Definition 7.3). This is the *only*
 * transport stage permitted to write to `G_t`. `realize` — what a given
 * action `kind` actually does to the DOM — is necessarily domain-specific
 * and is therefore injected, never hard-coded here; it must itself be
 * idempotent at the DOM level for Theorem 7.2 to hold.
 */

import type { Action } from "../contracts/action"
import { tag } from "./self-tag"

/**
 * Realizes one action against the DOM, returning every element it wrote
 * to (to be self-tagged). Idempotent: realizing an action that is already
 * satisfied must be a no-op on observable `G_t`.
 */
export type ActionRealizer<A extends Action> = (action: A) => Iterable<Element>

export type ApplyOptions<A extends Action> = {
  readonly realize: ActionRealizer<A>
  /** The self-tag value to stamp on every element the realizer touches for this action. */
  readonly tagValue: (action: A) => string
}

export function apply<A extends Action>(
  actions: ReadonlyArray<A>,
  options: ApplyOptions<A>
): void {
  for (const action of actions) {
    const value = options.tagValue(action)
    for (const element of options.realize(action)) {
      tag(element, value)
    }
  }
}
