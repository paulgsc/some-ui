/**
 * Execution results (LTY-EXEC, X1) — `docs/canon/complexity-witness-canon.typ`
 * Def. 4.1, Prop. 4.1, Cor. 4.1.
 *
 * `RunResult` is evidence, never proof (Thm. 4.1): per Prop. 4.1 it may
 * falsify an admissibility expectation, establish a concrete fact about one
 * input, or supply motivation — nothing else, and it may never appear as
 * the justification of a claim. The enforceable half of Cor. 4.1's two
 * forbidden inferences ("it timed out, therefore Θ(n²)"; "it ran in 4ms,
 * therefore Θ(n)") lives here as a type-level omission: no function in
 * `lib/leetype` that returns a cost (`lib/leetype/cost`'s `CostExpr`), a
 * Θ-class, a proposition, or a ledger transition takes a `RunResult`
 * parameter. (The prose half — a corpus sentence making the same forbidden
 * inference in words rather than in code — is
 * `checkNoMeasurementEntailmentClaim` in
 * `lib/leetype/exercises/corpus-lint.ts`, X4.)
 *
 * Engine-free, in the register of `lib/leetype/cost` and
 * `lib/leetype/reading-probe`: nothing here imports the wasm loader or any
 * hook, and nothing live imports this yet.
 */

/** The input size a run was executed at (Def. 4.1) — a measurement with no size attached cannot do the one job Prop. 4.1 permits. */
type InputSize = number

/** The three ways a run can fail (Def. 4.1). A round's error branch (Def. 8.1.2) fires on any of them, and the learner sees which. */
type ExecutionErrorClass = "compile" | "runtime" | "budget-exceeded"

/** One failed run: which of the three ways it failed, plus what the runtime said. */
export type ExecutionError = {
  readonly errorClass: ExecutionErrorClass
  readonly message: string
}

/**
 * Wall-clock milliseconds, wrapped rather than a plain `number` — in
 * particular, never comparable to a budget's wall-clock annotation (Def.
 * 1.3) without going through `compareElapsedToWallClockBudget` below, the
 * one named, commented conversion Ax. 3.1 permits.
 */
export type ElapsedMs = { readonly milliseconds: number }

/** Constructs an `ElapsedMs` from a raw millisecond count. Throws on a negative or non-finite value — elapsed time is a measurement, never a sentinel. */
export function elapsedMs(milliseconds: number): ElapsedMs {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(
      `elapsedMs: expected a finite, non-negative millisecond count, got ${milliseconds}`
    )
  }
  return { milliseconds }
}

/** What a successful run observed (Def. 4.1): output, logs, and how long it took. */
export type ExecutionObservation = {
  readonly output: string
  readonly logs: ReadonlyArray<string>
  readonly elapsed: ElapsedMs
}

/**
 * `r` (Def. 4.1): `ok(o)` carrying an observation, or `error(e)` carrying
 * one of the three failure classes above. Both branches carry the input
 * size the run was executed at, because Prop. 4.1's "establish a concrete
 * fact about one input" has no referent otherwise.
 */
export type RunResult =
  | {
      readonly kind: "ok"
      readonly inputSize: InputSize
      readonly observation: ExecutionObservation
    }
  | {
      readonly kind: "error"
      readonly inputSize: InputSize
      readonly error: ExecutionError
    }

/**
 * The one legitimate wall-clock comparison Ax. 3.1 allows: showing a
 * learner an elapsed run beside a budget's optional wall-clock annotation
 * (Def. 1.3), so they can see the two numbers side by side and that they
 * are "not the same kind of thing" — never as a substitute for
 * `T_A(C) <= B` (Def. 3.1), and never as the justification of a class
 * claim (Cor. 4.1). Ax. 3.1: a budget is an order-of-magnitude
 * admissibility heuristic, not a prediction of machine runtime — no
 * constant factor, cache behaviour, allocator, or language is modelled, so
 * "exceeded" here says nothing about admissibility, only about the clock.
 *
 * Takes a raw number rather than a `Budget` object because `Budget` (Def.
 * 1.3) has not landed yet (#1205, Step 2) — update this signature to take
 * `Budget`'s wall-clock annotation once it does, rather than adding a
 * second comparison path beside it.
 */
export function compareElapsedToWallClockBudget(
  elapsed: ElapsedMs,
  wallClockBudgetMs: number
): "within" | "exceeded" {
  return elapsed.milliseconds <= wallClockBudgetMs ? "within" : "exceeded"
}
