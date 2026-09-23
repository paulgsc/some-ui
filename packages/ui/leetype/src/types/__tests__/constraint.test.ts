import type { ComparisonOperator, Constraint } from "@leetype/types/constraint"
import {
  BudgetSchema,
  ComparisonOperatorSchema,
  ConstraintDiffSchema,
  ConstraintSchema,
  ConstraintSetSchema,
} from "@leetype/types/constraint"
import { describe, expect, it } from "vitest"

const VALID_CONSTRAINT = {
  dimension: "n",
  operator: "<=",
  bound: 100000,
} as const

describe("ComparisonOperatorSchema", () => {
  const CLOSED_SET: ReadonlyArray<ComparisonOperator> = [
    "<=",
    "<",
    ">=",
    ">",
    "=",
  ]

  it.each(CLOSED_SET)("accepts %s", (operator) => {
    expect(ComparisonOperatorSchema.parse(operator)).toBe(operator)
  })

  it("rejects an operator outside the closed set", () => {
    expect(() => ComparisonOperatorSchema.parse("!=")).toThrow()
  })
})

describe("ConstraintSchema", () => {
  it("accepts a constraint with a closed-set operator", () => {
    expect(ConstraintSchema.parse(VALID_CONSTRAINT)).toEqual(VALID_CONSTRAINT)
  })

  it("rejects an empty dimension", () => {
    expect(() =>
      ConstraintSchema.parse({ ...VALID_CONSTRAINT, dimension: "" })
    ).toThrow()
  })

  it("rejects an operator outside the closed set", () => {
    expect(() =>
      ConstraintSchema.parse({ ...VALID_CONSTRAINT, operator: "!=" })
    ).toThrow()
  })

  it("rejects a non-numeric bound", () => {
    expect(() =>
      ConstraintSchema.parse({ ...VALID_CONSTRAINT, bound: "100000" })
    ).toThrow()
  })
})

describe("ConstraintSetSchema", () => {
  it("accepts a non-empty set", () => {
    expect(ConstraintSetSchema.parse([VALID_CONSTRAINT])).toEqual([
      VALID_CONSTRAINT,
    ])
  })

  it("rejects an empty set — Ax. 1.1's 0 < |C|", () => {
    expect(() => ConstraintSetSchema.parse([])).toThrow()
  })

  it("accepts two constraints on distinct dimensions", () => {
    const second = { ...VALID_CONSTRAINT, dimension: "m", bound: 100 }
    expect(ConstraintSetSchema.parse([VALID_CONSTRAINT, second])).toEqual([
      VALID_CONSTRAINT,
      second,
    ])
  })

  // Review finding on #1251: Def. 1.2 defines C as "a finite set of
  // constraints over distinct dimensions" — two bounds on the same
  // dimension is an ambiguous constraint, not two independent ones.
  it('rejects two constraints on the same dimension — Def. 1.2\'s own "distinct dimensions"', () => {
    const duplicate = { ...VALID_CONSTRAINT, operator: ">=", bound: 1 }
    expect(() =>
      ConstraintSetSchema.parse([VALID_CONSTRAINT, duplicate])
    ).toThrow()
  })
})

describe("BudgetSchema", () => {
  it("accepts an operation count with no wall-clock annotation", () => {
    expect(BudgetSchema.parse({ operations: 10_000_000 })).toEqual({
      operations: 10_000_000,
    })
  })

  it("accepts an operation count with a wall-clock annotation", () => {
    const budget = { operations: 10_000_000, wallClock: "~1 second" }
    expect(BudgetSchema.parse(budget)).toEqual(budget)
  })

  it("rejects a non-positive operation count", () => {
    expect(() => BudgetSchema.parse({ operations: 0 })).toThrow()
    expect(() => BudgetSchema.parse({ operations: -1 })).toThrow()
  })

  it("rejects an empty wall-clock annotation", () => {
    expect(() =>
      BudgetSchema.parse({ operations: 1000, wallClock: "" })
    ).toThrow()
  })
})

describe("ConstraintDiffSchema", () => {
  const base: Constraint = { dimension: "n", operator: "<=", bound: 100000 }

  it("accepts a pair whose bound moved on a shared dimension", () => {
    const diff = { before: [base], after: [{ ...base, bound: 200000 }] }
    expect(ConstraintDiffSchema.parse(diff)).toEqual(diff)
  })

  it("accepts a pair with one changed and one unchanged dimension", () => {
    const second: Constraint = { dimension: "m", operator: "<=", bound: 100 }
    const diff = {
      before: [base, second],
      after: [{ ...base, bound: 200000 }, second],
    }
    expect(ConstraintDiffSchema.parse(diff)).toEqual(diff)
  })

  // Def. 3.2's own requirement, R3's acceptance criterion word for word:
  // "a pair that differs in nothing fails validation."
  it("rejects a pair identical in every bound", () => {
    const diff = { before: [base], after: [{ ...base }] }
    expect(() => ConstraintDiffSchema.parse(diff)).toThrow()
  })

  it("rejects a pair that adds a dimension — out of Thm. 3.1's scope", () => {
    const extra: Constraint = { dimension: "m", operator: "<=", bound: 10 }
    const diff = { before: [base], after: [base, extra] }
    expect(() => ConstraintDiffSchema.parse(diff)).toThrow()
  })

  it("rejects a pair that removes a dimension — out of Thm. 3.1's scope", () => {
    const extra: Constraint = { dimension: "m", operator: "<=", bound: 10 }
    const diff = { before: [base, extra], after: [base] }
    expect(() => ConstraintDiffSchema.parse(diff)).toThrow()
  })

  it("rejects a pair that changes a dimension's operator — Thm. 3.1: only the bound moves", () => {
    const changedOperator: Constraint = {
      dimension: "n",
      operator: "<",
      bound: 200000,
    }
    const diff = { before: [base], after: [changedOperator] }
    expect(() => ConstraintDiffSchema.parse(diff)).toThrow()
  })
})
