import {
  checkConstraintDimensions,
  dimensionsOfConstraints,
  evaluateConstraint,
} from "@leetype/lib/leetype/constraint"
import { dim, Loop, Seq, W } from "@leetype/lib/leetype/cost"
import type { Constraint, ConstraintSet } from "@leetype/types/constraint"
import { describe, expect, it } from "vitest"

describe('evaluateConstraint — Def. 1.2\'s own "evaluable at a numeric point"', () => {
  const cases: Array<{
    operator: Constraint["operator"]
    value: number
    expected: boolean
  }> = [
    { operator: "<=", value: 100, expected: true },
    { operator: "<=", value: 101, expected: false },
    { operator: "<", value: 99, expected: true },
    { operator: "<", value: 100, expected: false },
    { operator: ">=", value: 100, expected: true },
    { operator: ">=", value: 99, expected: false },
    { operator: ">", value: 101, expected: true },
    { operator: ">", value: 100, expected: false },
    { operator: "=", value: 100, expected: true },
    { operator: "=", value: 99, expected: false },
  ]

  it.each(cases)(
    "n $operator 100 at $value is $expected",
    ({ operator, value, expected }) => {
      const constraint: Constraint = { dimension: "n", operator, bound: 100 }
      expect(evaluateConstraint(constraint, value)).toBe(expected)
    }
  )
})

describe("dimensionsOfConstraints", () => {
  it("collects every distinct dimension identifier in C", () => {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100000 },
      { dimension: "m", operator: "<=", bound: 100 },
      { dimension: "n", operator: ">=", bound: 1 },
    ]
    expect(dimensionsOfConstraints(constraints)).toEqual(new Set(["n", "m"]))
  })
})

describe("checkConstraintDimensions — R2's own acceptance criterion", () => {
  it("is clean when every constraint's dimension is repeated over somewhere in the graph", () => {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100000 },
    ]
    const graph = Loop(dim("n"), W(1))
    expect(checkConstraintDimensions(constraints, graph)).toEqual([])
  })

  it("flags a constraint whose dimension no repetition expression mentions", () => {
    const constraints: ConstraintSet = [
      { dimension: "m", operator: "<=", bound: 100 },
    ]
    const graph = Loop(dim("n"), W(1))
    const violations = checkConstraintDimensions(constraints, graph)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('"m"')
  })

  it("checks every constraint independently, across nested Seq/Loop", () => {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100000 },
      { dimension: "m", operator: "<=", bound: 100 },
      { dimension: "k", operator: "<=", bound: 10 },
    ]
    const graph = Loop(dim("n"), Seq(Loop(dim("m"), W(1)), W(1)))
    const violations = checkConstraintDimensions(constraints, graph)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('"k"')
  })

  it("does not flag a graph dimension that C leaves unconstrained — one-directional by design", () => {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100000 },
    ]
    const graph = Loop(dim("n"), Loop(dim("m"), W(1)))
    expect(checkConstraintDimensions(constraints, graph)).toEqual([])
  })
})
