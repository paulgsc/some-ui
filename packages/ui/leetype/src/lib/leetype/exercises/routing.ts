import type { Snapshot } from "@leetype/types/leetype"

import type { Obligation } from "./obligation-graph"

/**
 * Route on what is not confounded (LTY-ROUTE R5) — the between-obligation
 * half of what the engine's per-attempt reveal delay already does within
 * one.
 *
 * `adaptive-learning-canon.typ` Axiom 3.1: evidence arrives confounded,
 * and no single observation identifies a competence. A pause is
 * consistent with not knowing the witness, knowing it but mistyping,
 * keyboard unfamiliarity, reading the frame, or a phone ringing — routing
 * on *why* a learner paused would be a claim this channel cannot support.
 * `Snapshot.attempt` and `Snapshot.assisted` are the two signals that
 * don't make that claim: they say *this witness was not fluently
 * produced*, never *why*. Nothing else in `Snapshot` — `wpm`,
 * `consecutiveErrors`, `manualRevealActive`, and every other field — is
 * read here, and `routeObligation`'s own signature is what enforces that:
 * its first parameter is `Pick<Snapshot, "attempt" | "assisted">`, not
 * `Snapshot`, so nothing else can reach it without the caller
 * constructing an object literal that would fail its own excess-property
 * check.
 *
 * # The five-row table, and how it's actually derived from two signals
 *
 * The issue states five named outcomes but not a formula, and two of
 * them — "completed with partial reveal" and "repeated assisted
 * completion" — are not distinguishable from `(attempt, assisted)` alone:
 * with `MAX_STEP_ATTEMPTS = 3` (`crates/leetype_wasm/src/leetype/reveal.rs`)
 * there is exactly one attempt value (`1`) that is neither the first
 * attempt nor the cap, so both rows would otherwise collide on the same
 * `(attempt: 1, assisted: > 0)` case. The two responses differ in kind —
 * "unchanged" versus "route through a more decomposed obligation" — and
 * that difference is a fact about the *graph*, not about this one
 * observation: whether a more-decomposed alternative actually exists to
 * route to. `Obligation.sinkRoutes` (R2) is the only graph-authored data
 * that currently answers that question — a non-empty `sinkRoutes` is a
 * declared alternative; an empty one is not — so it is the second,
 * non-`Snapshot` parameter here, not a third confounded inference.
 *
 * | attempt vs. cap | assisted | sinkRoutes  | Row | Outcome |
 * | --------------- | -------- | ----------- | --- | ------- |
 * | below cap        | `0`      | —           | fluent completion | `"next-fluent"` |
 * | below cap, first  | `> 0`    | —           | fully revealed, first attempt | `"next-uncredited"` |
 * | below cap, repeat | `> 0`    | empty       | partial reveal | `"next-partial-reveal"` |
 * | below cap, repeat | `> 0`    | non-empty   | repeated assisted completion | `"decompose"` |
 * | at or past cap    | any      | —           | escape at the cap | `"worked-route"` |
 *
 * The cap check runs first and is unconditional on `assisted`: a
 * genuinely fluent pass that happens to land on the last allowed attempt
 * still routes to the worked route here, which trades a small amount of
 * precision (that learner did not, strictly, need it) for the same
 * conservative default `route(U)` (R3) is built on — sending an
 * unnecessary worked route costs little, and failing to send a needed one
 * costs a stuck learner.
 *
 * # What is deliberately not here
 *
 * `"next-uncredited"` is the routing decision only. Whether an uncredited
 * completion is recorded as an *encounter* without being credited is
 * LTY-YIELD Y2 — a different epic — and this module makes no belief
 * write, credits nothing, and persists nothing. No sink is ever inferred
 * here: every value `routeObligation` can return is a routing outcome,
 * never a `SinkId` or anything shaped like one. Sinks exist only where R1
 * and R2 put them — in the authored graph — never computed from typing
 * behavior.
 */

export type RoutingSignal = Pick<Snapshot, "attempt" | "assisted">

/**
 * The five outcomes, named after the row they discharge. `"decompose"`
 * and `"worked-route"` are the two that change what happens next;
 * `"next-fluent"`, `"next-partial-reveal"` and `"next-uncredited"` all
 * advance to the graph's own next obligation (`linearize()`'s ordinary
 * order) and differ only in what a future component might do with the
 * label — LTY-YIELD Y2 for `"next-uncredited"`, nothing yet for the
 * other two.
 */
export type ObligationRouteOutcome =
  | "next-fluent"
  | "next-partial-reveal"
  | "next-uncredited"
  | "decompose"
  | "worked-route"

/**
 * Mirrors the engine's real `MAX_STEP_ATTEMPTS` cap check
 * (`attempt + 1 >= MAX_STEP_ATTEMPTS`, `crates/leetype_wasm/src/leetype/reveal.rs`),
 * expressed as the zero-based attempt index at which it fires. Not
 * redefined authoritatively here for the same reason `totality.ts`'s
 * `ASSUMED_MAX_ATTEMPTS_PER_NODE` isn't: no crate dependency in this
 * epic's lane. If the engine's cap ever changes, this must change with
 * it.
 */
const CAP_ATTEMPT_INDEX = 2

/**
 * Routes a completed obligation to its next step, reading only the two
 * signals `adaptive-learning-canon.typ` Axiom 3.1 permits and this
 * module's own doc comment derives the five-row table from.
 */
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
