/**
 * Admissibility (LTY-COST, G3, #1211) — `docs/canon/complexity-witness-canon.typ`
 * Def. 3.1, Prop. 2.1, Ax. 3.1.
 *
 * `evaluate` is `T` evaluated at a constraint set's own bounds (Def. 3.1's
 * "evaluated at the bounds of C") — an exact operation count, not a reduced
 * class: nothing about a monomial's dimension is dropped or approximated,
 * because Def. 3.1 compares that exact count against `B`, not a `Θ`-class
 * against a `Θ`-class. `isAdmissible` is Def. 3.1's own relation,
 * `T_A(C) <= B`, put together from `evaluate` and `lib/leetype/cost`'s
 * `costOf`.
 *
 * Engine-free, in the register of `lib/leetype/cost` and
 * `lib/leetype/constraint`: nothing here imports the wasm loader or any
 * hook, and nothing live imports this yet.
 */

import type {
  CostExpr,
  CostGraph,
  Dimension,
  Monomial,
} from "@leetype/lib/leetype/cost"
import { costOf } from "@leetype/lib/leetype/cost"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"

function boundsByDimension(
  constraints: ConstraintSet
): ReadonlyMap<Dimension, number> {
  return new Map(
    constraints.map((constraint) => [constraint.dimension, constraint.bound])
  )
}

/**
 * A monomial's value at a point (a dimension's `pow` factor becomes
 * `bound^exponent`; a `log` factor becomes `log2(bound)^exponent` — the
 * base is a constant factor Ax. 3.1 already declares out of scope for `B`,
 * so any base would do; `log2` is this workspace's own arbitrary but fixed
 * choice, not a claim the canon makes). Throws if `T` references a
 * dimension `C` does not bound — Def. 3.1 itself calls that case
 * "undefined," not zero or one by convention.
 */
function evaluateMonomial(
  monomial: Monomial,
  bounds: ReadonlyMap<Dimension, number>
): number {
  let value = 1
  for (const factor of monomial) {
    const bound = bounds.get(factor.dimension)
    if (bound === undefined) {
      throw new Error(
        `evaluate: no constraint in C bounds dimension "${factor.dimension}" — ` +
          "Def. 3.1's admissibility is undefined without a bound for every dimension T references."
      )
    }
    const base = factor.kind === "log" ? Math.log2(bound) : bound
    value *= base ** factor.exponent
  }
  return value
}

/**
 * `T` evaluated at `C`'s bounds (Def. 3.1) — the exact operation count a
 * round's admissibility decision compares against `B`. Sums every term's
 * `coefficient * evaluateMonomial(term.monomial, C)`, so two expressions
 * that share a `Θ`-class but differ in a coefficient or a lower-degree term
 * can still evaluate to different counts, and therefore to different
 * admissibility verdicts under the same `C`/`B` — nothing here reduces `T`
 * to its class before comparing.
 */
export function evaluate(cost: CostExpr, constraints: ConstraintSet): number {
  const bounds = boundsByDimension(constraints)
  return cost.reduce(
    (total, term) =>
      total + term.coefficient * evaluateMonomial(term.monomial, bounds),
    0
  )
}

/**
 * Def. 3.1 itself: `A` is admissible under `(C, B)` iff `T(G_A)`, evaluated
 * at `C`'s bounds, is at most `B`. The only function in this workspace
 * allowed to answer "is this admissible" — Prop. 2.1 forbids answering it
 * any other way, e.g. by comparing an authored `Θ`-class string to a budget
 * string.
 */
export function isAdmissible(
  graph: CostGraph,
  constraints: ConstraintSet,
  budget: Budget
): boolean {
  return evaluate(costOf(graph), constraints) <= budget.operations
}

/**
 * R4 (#1207, LTY-ROUND) has not landed as of this story: there is no real
 * corpus type yet holding an author's "this member of D is the admissible
 * one" claim. This type is this story's own minimal stand-in — a label, the
 * member's own cost graph, and the authored boolean — so that
 * `checkAdmissibleClaimsAgreeWithDerivation` (below) has a stable, testable
 * contract today. When R4 lands its own `DiffHunk`-bearing round-diff-set
 * type, whichever field holds the authored claim maps onto `AdmissibleClaim`
 * at the call site; this type's own shape should not need to change.
 */
export type AdmissibleClaim = {
  readonly label: string
  readonly graph: CostGraph
  readonly authoredAdmissible: boolean
}

/**
 * G3's own acceptance criterion for R4: "R4's authored 'this member is the
 * admissible one' is checked against `isAdmissible`, and a disagreement
 * fails the corpus lint with both values printed." Not yet wired into
 * `lib/leetype/exercises/corpus-lint`'s live `lintCorpus` scan — there is no
 * real corpus data shaped like `AdmissibleClaim` for it to run over until
 * R4 lands its own schema (see this module's own doc comment on
 * `AdmissibleClaim`) — but the checking mechanism itself exists and is
 * unit-tested against synthetic fixtures shaped like what R4 will produce,
 * the same "additive, nothing live imports this yet" posture every story on
 * this relay has taken.
 */
export function checkAdmissibleClaimsAgreeWithDerivation(
  claims: ReadonlyArray<AdmissibleClaim>,
  constraints: ConstraintSet,
  budget: Budget,
  where: string
): Array<string> {
  const violations: Array<string> = []
  for (const claim of claims) {
    const derived = isAdmissible(claim.graph, constraints, budget)
    if (derived !== claim.authoredAdmissible) {
      const describe = (admissible: boolean): string =>
        admissible ? "admissible" : "not admissible"
      violations.push(
        `${where}: "${claim.label}" is authored as ${describe(claim.authoredAdmissible)}, ` +
          `but isAdmissible(G, C, B) derives ${describe(derived)} — Prop. 2.1 forbids overriding ` +
          "the derivation with an authored claim; the defect is in G (fix the cost graph) or in " +
          "the authored claim, never in isAdmissible."
      )
    }
  }
  return violations
}
