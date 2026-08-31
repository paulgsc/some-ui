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
import type { Constraint, ConstraintSet } from "@leetype/types/constraint"
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
