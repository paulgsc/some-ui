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
 * `C` (Ax. 1.1, Def. 1.2): a round's whole constraint set. `0 < |C|` is not
 * a convention this schema chooses to enforce, it is the axiom itself —
 * Def. 3.1 (admissibility) has nothing to quantify over without at least
 * one bound, so an empty set is rejected at parse time rather than left
 * for a caller to notice its absence silently made every admissibility
 * check vacuously true. Def. 1.2 also defines `C` as a set "over distinct
 * dimensions" — two constraints on the same dimension is not two
 * independent bounds, it is one dimension with an ambiguous bound, so this
 * schema rejects it at parse time for the same reason it rejects an empty
 * set: leaving it for `checkConstraintDimensions` or an admissibility
 * check to notice later would let malformed data reach either silently.
 */
export const ConstraintSetSchema = z
  .array(ConstraintSchema)
  .min(1)
  .refine(
    (constraints) =>
      new Set(constraints.map((constraint) => constraint.dimension)).size ===
      constraints.length,
    {
      message:
        "a constraint set must bound distinct dimensions (Def. 1.2) — two constraints on the same dimension is an ambiguous bound, not two independent ones",
    }
  )
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

const dimensionSetOf = (constraints: ConstraintSet): ReadonlySet<string> =>
  new Set(constraints.map((constraint) => constraint.dimension))

const constraintByDimension = (
  constraints: ConstraintSet
): ReadonlyMap<string, Constraint> =>
  new Map(constraints.map((constraint) => [constraint.dimension, constraint]))

/**
 * `(C, C′)` (Def. 3.2, R3/#1206): a constraint perturbation, held as data so
 * it can be rendered and reasoned about rather than described in prose.
 *
 * Theorem 3.1's own hypothesis is that only numeric bounds moved — `T` as a
 * function, the set of dimensions, and each dimension's comparison operator
 * all stay fixed. This schema rejects anything wider at parse time, per R3's
 * own acceptance criterion ("a round whose constraint diff changes the
 * *number* of dimensions, or their relationships, is out of Thm. 3.1's
 * scope"): a dimension added or removed, an operator changed on a shared
 * dimension, or a pair with no bound difference at all is not a `Def. 3.2`
 * constraint diff — it is a different kind of change this schema does not
 * model.
 */
export const ConstraintDiffSchema = z
  .object({
    before: ConstraintSetSchema,
    after: ConstraintSetSchema,
  })
  .refine(
    (diff) => {
      const beforeDimensions = dimensionSetOf(diff.before)
      const afterDimensions = dimensionSetOf(diff.after)
      return (
        beforeDimensions.size === afterDimensions.size &&
        [...beforeDimensions].every((dimension) =>
          afterDimensions.has(dimension)
        )
      )
    },
    {
      message:
        "a constraint diff must bound the same dimensions before and after — Thm. 3.1's own hypothesis is that only numeric bounds moved, so an added or removed dimension is a different kind of change than this schema models",
    }
  )
  .refine(
    (diff) => {
      const after = constraintByDimension(diff.after)
      return diff.before.every(
        (constraint) =>
          after.get(constraint.dimension)?.operator === constraint.operator
      )
    },
    {
      message:
        "a constraint diff must not change a dimension's comparison operator — Thm. 3.1's hypothesis is that only the bound moves, never the relationship it expresses",
    }
  )
  .refine(
    (diff) => {
      const after = constraintByDimension(diff.after)
      return diff.before.some(
        (constraint) =>
          after.get(constraint.dimension)?.bound !== constraint.bound
      )
    },
    {
      message:
        "a constraint diff must change at least one bound (Def. 3.2) — a pair identical in every bound is not a diff",
    }
  )
export type ConstraintDiff = z.infer<typeof ConstraintDiffSchema>
