import type { Snapshot } from "@leetype/types/leetype"

import type { Obligation } from "./obligation-graph"

/**
 * Route on what is not confounded (LTY-ROUTE R5): the between-obligation
 * half of what the engine's per-attempt reveal delay does within one.
 *
 * `adaptive-learning-canon.typ` Axiom 3.1: evidence arrives confounded. A
 * pause may be not knowing, mistyping, an unfamiliar keyboard, reading, or a
 * phone ringing, so routing on *why* is unsupported. `Snapshot.attempt` and
 * `Snapshot.assisted` say only *this witness was not fluently produced*.
 * The first parameter is `Pick<Snapshot, "attempt" | "assisted">`, so no
 * other field can reach this function.
 *
 * # The five-row table from two signals
 *
 * With `MAX_STEP_ATTEMPTS = 3` (`reveal.rs`), "partial reveal" and
 * "repeated assisted completion" collide on `(attempt: 1, assisted: > 0)`.
 * They differ by whether the *graph* declares a more decomposed
 * alternative, so `Obligation.sinkRoutes` (non-empty = declared) is the
 * second parameter, not a third confounded inference.
 *
 * | attempt vs. cap | assisted | sinkRoutes  | Row | Outcome |
 * | --------------- | -------- | ----------- | --- | ------- |
 * | below cap        | `0`      | —           | fluent completion | `"next-fluent"` |
 * | below cap, first  | `> 0`    | —           | any reveal used, first attempt | `"next-uncredited"` |
 * | below cap, repeat | `> 0`    | empty       | partial reveal | `"next-partial-reveal"` |
 * | below cap, repeat | `> 0`    | non-empty   | repeated assisted completion | `"decompose"` |
 * | at or past cap    | any      | —           | escape at the cap | `"worked-route"` |
 *
 * The cap check runs first regardless of `assisted`: an unneeded worked
 * route costs little, a missing one costs a stuck learner (as `route(U)`).
 *
 * `"next-uncredited"` fires on *any* first-attempt reveal, not only a fully
 * revealed one: telling them apart needs a slot total this router may not
 * read. Reveal opens only on sustained low WPM, so any first-attempt
 * reveal is already evidence of hesitation.
 *
 * Routing only: whether an uncredited completion is recorded is LTY-YIELD
 * Y2. Nothing here writes belief, credits or persists, and no sink is ever
 * inferred; sinks exist only in the authored graph.
 */

export type RoutingSignal = Pick<Snapshot, "attempt" | "assisted">

/**
 * The five outcomes, named after their rows. Only `"decompose"` and
 * `"worked-route"` change what happens next; the three `"next-*"` advance in
 * `linearize()` order and differ only in label.
 */
export type ObligationRouteOutcome =
  | "next-fluent"
  | "next-partial-reveal"
  | "next-uncredited"
  | "decompose"
  | "worked-route"

/**
 * Mirrors the engine's cap check (`attempt + 1 >= MAX_STEP_ATTEMPTS`,
 * `reveal.rs`) as a zero-based attempt index. Must follow the engine if its
 * cap changes (as `totality.ts`'s `ASSUMED_MAX_ATTEMPTS_PER_NODE`).
 */
const CAP_ATTEMPT_INDEX = 2

/** Routes a completed obligation to its next step (see the table above). */
export function routeObligation(
  signal: RoutingSignal,
  obligation: Pick<Obligation, "sinkRoutes">
): ObligationRouteOutcome {
  if (signal.attempt >= CAP_ATTEMPT_INDEX) return "worked-route"
  if (signal.assisted === 0) return "next-fluent"
  if (signal.attempt === 0) return "next-uncredited"
  const hasDeclaredAlternative = Object.keys(obligation.sinkRoutes).length > 0
  return hasDeclaredAlternative ? "decompose" : "next-partial-reveal"
}
