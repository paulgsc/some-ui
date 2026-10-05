import { z } from "zod"

/**
 * The comparisons a constraint's bound admits (Def. 1.2). Plain arithmetic,
 * as in every canon example (`n ≤ 10^5`), so `evaluateConstraint` is just
 * `value <compare> bound`. No expression parser.
 */
export const ComparisonOperatorSchema = z.enum(["<=", "<", ">=", ">", "="])
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>

/**
 * A constraint (Def. 1.2): a bound on one named input dimension, `n ≤ 10^5`
 * is `{ dimension: "n", operator: "<=", bound: 100000 }`. Data, never prose,
 * so it can take part in admissibility. `dimension` is shared with the cost
 * graph's repetitions, checked by `checkConstraintDimensions`.
 */
export const ConstraintSchema = z.object({
  dimension: z.string().min(1),
  operator: ComparisonOperatorSchema,
  bound: z.number(),
})
export type Constraint = z.infer<typeof ConstraintSchema>

/**
 * `C` (Ax. 1.1, Def. 1.2): a round's whole constraint set, rejected at parse
 * time when empty (`0 < |C|`; admissibility would be vacuously true) or when
 * two constraints share a dimension (Def. 1.2: "over distinct dimensions";
 * the bound would be ambiguous).
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
 * `B`: a bound on admissible work in primitive operations. `wallClock` is a
 * human-scale annotation only; admissibility reads `operations` alone.
 *
 * Axiom 3.1: `operations` models no constant factor, cache, allocator or
 * language, and a surface presenting `B` must say so (`BudgetDisplay`).
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
 * `(C, C′)` (Def. 3.2): a constraint perturbation, held as data. Thm. 3.1
 * assumes only numeric bounds move, so this rejects an added or removed
 * dimension, a changed operator, or a pair with no bound difference.
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
