import { z } from "zod"

/**
 * The comparisons a constraint's bound admits (Def. 1.2). Plain arithmetic
 * only — every worked example the canon itself cites (`n ≤ 10^5`,
 * `|a| ≤ 100`) is one of these, and each is evaluable at a numeric point by
 * construction: `evaluateConstraint` (`lib/leetype/constraint`) is nothing
 * more than `value <compare> bound`. No expression parser, no partial
 * evaluation — a richer bound is a real future need with its own semantics,
 * same posture R2's own "out of scope" line takes on relating two
 * dimensions to each other.
 */
export const ComparisonOperatorSchema = z.enum(["<=", "<", ">=", ">", "="])
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>

/**
 * A constraint (Def. 1.2): a symbolic bound on one named input dimension —
 * `n ≤ 10^5` is `{ dimension: "n", operator: "<=", bound: 100000 }`.
 * Constraints are data, never prose: a bound the system cannot evaluate
 * against a cost expression is a comment, and a comment cannot participate
 * in an admissibility decision (#1198 G3). `dimension` is shared with the
 * cost graph's own repetition expressions (`Dimension`,
 * `lib/leetype/cost`) — `checkConstraintDimensions`
 * (`lib/leetype/constraint`) is what turns "shared" into a checked
 * invariant instead of a coincidence two modules happen to agree on today.
 */
export const ConstraintSchema = z.object({
  dimension: z.string().min(1),
  operator: ComparisonOperatorSchema,
  bound: z.number(),
})
export type Constraint = z.infer<typeof ConstraintSchema>

/**
 * `C` (Ax. 1.1): a round's whole constraint set. `0 < |C|` is not a
 * convention this schema chooses to enforce, it is the axiom itself — Def.
 * 3.1 (admissibility) has nothing to quantify over without at least one
 * bound, so an empty set is rejected at parse time rather than left for a
 * caller to notice its absence silently made every admissibility check
 * vacuously true.
 */
export const ConstraintSetSchema = z.array(ConstraintSchema).min(1)
export type ConstraintSet = z.infer<typeof ConstraintSetSchema>

/**
 * `B`: a bound on admissible work in primitive operations, optionally
 * annotated with a wall-clock figure for the learner's benefit only —
 * `wallClock` never participates in an admissibility decision (that is
 * `operations` alone, compared against `T` evaluated at the constraint's
 * bounds — #1198 G3); it exists purely so a rendered surface can put a
 * human-scale number beside the operation count.
 *
 * Axiom 3.1: no constant factor, no cache behaviour, no allocator, no
 * language is modelled by `operations`. A surface presenting `B` must say
 * so to the learner — `BudgetDisplay` (`components/round/budget-display`)
 * is where that requirement is discharged, not this schema.
 */
export const BudgetSchema = z.object({
  operations: z.number().positive(),
  wallClock: z.string().min(1).optional(),
})
export type Budget = z.infer<typeof BudgetSchema>
