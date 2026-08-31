/**
 * R2 (#1205), Def. 1.2 / Def. 1.3 / Ax. 3.1: evaluating a constraint at a
 * numeric point, and the cross-check that keeps a constraint's dimension
 * honest against the cost graph it is actually bounding.
 *
 * Engine-free, in the register of `lib/leetype/cost`: nothing here imports
 * the wasm loader or any hook, and nothing live imports this yet.
 */

import type { CostGraph, Dimension } from "@leetype/lib/leetype/cost"
import { dimensionsOfGraph } from "@leetype/lib/leetype/cost"
import type {
  Constraint,
  ConstraintDiff,
  ConstraintSet,
} from "@leetype/types/constraint"
import type { RenderedDiffLineKind } from "@leetype/types/exercise"
import { assertNever } from "some-ui-utils"

/**
 * A constraint evaluated at a numeric point (Def. 1.2's own "a bound
 * expression evaluable at a numeric point") — nothing more than
 * `value <operator> bound`, which is the whole reason a constraint's bound
 * is data (`operator` + `bound`) rather than a prose expression.
 */
export function evaluateConstraint(
  constraint: Constraint,
  value: number
): boolean {
  switch (constraint.operator) {
    case "<=": {
      return value <= constraint.bound
    }
    case "<": {
      return value < constraint.bound
    }
    case ">=": {
      return value >= constraint.bound
    }
    case ">": {
      return value > constraint.bound
    }
    case "=": {
      return value === constraint.bound
    }
    default: {
      return assertNever(constraint.operator)
    }
  }
}

/** Every dimension identifier `C` bounds, deduplicated. */
export function dimensionsOfConstraints(
  constraints: ConstraintSet
): ReadonlySet<Dimension> {
  return new Set(constraints.map((constraint) => constraint.dimension))
}

/**
 * "A constraint on a dimension no repetition expression mentions is a lint
 * failure, not a silently ignored bound" — R2's own acceptance criterion.
 * Mechanical, in the same register as `lib/leetype/exercises/corpus-lint`'s
 * own checks: a list of violation strings, empty meaning clean. Deliberately
 * one-directional — a dimension the graph repeats over but `C` never bounds
 * is not this check's concern (an unconstrained dimension is a modelling
 * choice, not the "silently ignored bound" the criterion names).
 */
export function checkConstraintDimensions(
  constraints: ConstraintSet,
  graph: CostGraph
): Array<string> {
  const graphDimensions = dimensionsOfGraph(graph)
  const violations: Array<string> = []
  for (const constraint of constraints) {
    if (!graphDimensions.has(constraint.dimension)) {
      violations.push(
        `constraint on dimension "${constraint.dimension}" has no matching repetition ` +
          "expression anywhere in the cost graph — a bound on a dimension the cost graph " +
          "never repeats over cannot participate in an admissibility decision."
      )
    }
  }
  return violations
}

/**
 * One row of a `ConstraintDiff`'s rendered comparison — the same
 * `"context" | "del" | "add"` vocabulary `renderedDiffLineKinds`
 * (`types/exercise.ts`) already established for a code diff's rendered
 * lines, reused here rather than reinvented (R3's own acceptance criterion:
 * "reusing `DiffCard`'s row model rather than inventing a second one").
 */
export type ConstraintDiffRow = {
  index: number
  kind: RenderedDiffLineKind
  dimension: string
  operator: Constraint["operator"]
  bound: number
}

/**
 * `(C, C′)` unrolled into the ordered row list `ConstraintDiff` (the
 * component, `components/round/constraint-diff`) renders. A changed
 * dimension becomes two adjacent rows — its old bound as `del`, immediately
 * followed by its new bound as `add` — the same paired shape a code diff
 * uses for a changed line; an unchanged dimension becomes one `context` row.
 *
 * Order follows `diff.before`. `ConstraintDiffSchema` already guarantees
 * `diff.before` and `diff.after` bound the same dimensions (same size, same
 * names, same operators) once a diff has actually parsed, so every
 * `afterByDimension` lookup below finds a match for any caller passing a
 * validated `ConstraintDiff` — the one case a lookup can miss is a `diff`
 * hand-built to a type not actually validated by that schema, which is not
 * this function's contract to guard against.
 */
export function constraintDiffRows(
  diff: ConstraintDiff
): ReadonlyArray<ConstraintDiffRow> {
  const afterByDimension = new Map(
    diff.after.map((constraint) => [constraint.dimension, constraint])
  )
  const rows: Array<ConstraintDiffRow> = []
  for (const before of diff.before) {
    const after = afterByDimension.get(before.dimension)
    if (after === undefined) continue
    if (after.bound === before.bound) {
      rows.push({
        index: rows.length,
        kind: "context",
        dimension: before.dimension,
        operator: before.operator,
        bound: before.bound,
      })
      continue
    }
    rows.push({
      index: rows.length,
      kind: "del",
      dimension: before.dimension,
      operator: before.operator,
      bound: before.bound,
    })
    rows.push({
      index: rows.length,
      kind: "add",
      dimension: after.dimension,
      operator: after.operator,
      bound: after.bound,
    })
  }
  return rows
}
