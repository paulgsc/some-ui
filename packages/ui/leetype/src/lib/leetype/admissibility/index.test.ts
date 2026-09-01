import {
  checkAdmissibleClaimsAgreeWithDerivation,
  evaluate,
  isAdmissible,
} from "@leetype/lib/leetype/admissibility"
import type { AdmissibleClaim } from "@leetype/lib/leetype/admissibility"
import {
  costOf,
  dim,
  logDim,
  Loop,
  multiplyMonomials,
  printClass,
  Seq,
  W,
} from "@leetype/lib/leetype/cost"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import { describe, expect, it } from "vitest"

describe("evaluate — T at C's own bounds (Def. 3.1)", () => {
  it("evaluates a single-dimension monomial at its constraint's bound", () => {
    const cost = costOf(Loop(dim("n"), W(1)))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100 },
    ]
    expect(evaluate(cost, constraints)).toBe(100)
  })

  it("evaluates a log factor as log2 of the bound", () => {
    const cost = costOf(Loop(multiplyMonomials(dim("n"), logDim("n")), W(1)))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1024 },
    ]
    // n * log2(n) at n = 1024: 1024 * 10 = 10240.
    expect(evaluate(cost, constraints)).toBe(10240)
  })

  it("looks up each dimension independently across a multi-dimension monomial", () => {
    const cost = costOf(Loop(multiplyMonomials(dim("n"), dim("m")), W(1)))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 100 },
      { dimension: "m", operator: "<=", bound: 50 },
    ]
    expect(evaluate(cost, constraints)).toBe(5000)
  })

  it("sums every term's own contribution", () => {
    const cost = costOf(Seq(Loop(dim("n"), W(2)), Loop(dim("n", 2), W(3))))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 10 },
    ]
    // 2*10 + 3*10^2 = 20 + 300 = 320.
    expect(evaluate(cost, constraints)).toBe(320)
  })

  it("throws when C bounds no dimension T references — Def. 3.1 calls this case undefined, not zero", () => {
    const cost = costOf(Loop(dim("n"), W(1)))
    const constraints: ConstraintSet = [
      { dimension: "m", operator: "<=", bound: 100 },
    ]
    expect(() => evaluate(cost, constraints)).toThrow(/dimension "n"/)
  })
})

describe("isAdmissible — Def. 3.1's own relation, T_A(C) <= B", () => {
  it("is admissible when the evaluated cost is at most the budget", () => {
    const graph = Loop(dim("n"), W(1))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1000 },
    ]
    const budget: Budget = { operations: 1000 }
    expect(isAdmissible(graph, constraints, budget)).toBe(true)
  })

  it("is not admissible when the evaluated cost exceeds the budget", () => {
    const graph = Loop(dim("n"), W(1))
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1000 },
    ]
    const budget: Budget = { operations: 999 }
    expect(isAdmissible(graph, constraints, budget)).toBe(false)
  })

  // The modeling gotcha this story's own handoff calls out by name: two
  // graphs sharing a Θ-class must not be treated as interchangeable by
  // admissibility. Both G1 = Loop(n, W(1)) and G2 = Loop(n, W(1000)) are
  // Θ(n) — printClass agrees on both — but their exact evaluated cost at
  // the same bound differs by three orders of magnitude, and a budget
  // between the two must find one admissible and the other not. If
  // isAdmissible ever gets rewritten to compare classes instead of exact
  // evaluated counts, this is the test that catches it.
  it("does not reduce to the Θ-class first — same class, different evaluated cost, different verdict", () => {
    const cheap = Loop(dim("n"), W(1))
    const expensive = Loop(dim("n"), W(1000))
    expect(printClass(costOf(cheap))).toBe("Θ(n)")
    expect(printClass(costOf(expensive))).toBe("Θ(n)")

    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1000 },
    ]
    const budget: Budget = { operations: 500_000 }

    expect(isAdmissible(cheap, constraints, budget)).toBe(true)
    expect(isAdmissible(expensive, constraints, budget)).toBe(false)
  })
})

describe("checkAdmissibleClaimsAgreeWithDerivation — G3's own check for R4's authored claim (#1207, not yet landed)", () => {
  const constraints: ConstraintSet = [
    { dimension: "n", operator: "<=", bound: 1000 },
  ]
  const budget: Budget = { operations: 2000 }

  it("is clean when the authored claim agrees with the derivation", () => {
    const claims: ReadonlyArray<AdmissibleClaim> = [
      {
        label: "the two-pointer rewrite",
        graph: Loop(dim("n"), W(1)),
        authoredAdmissible: true,
      },
    ]
    expect(
      checkAdmissibleClaimsAgreeWithDerivation(
        claims,
        constraints,
        budget,
        "fixture"
      )
    ).toEqual([])
  })

  it("flags a claim authored as admissible when the derivation disagrees, naming both values", () => {
    const claims: ReadonlyArray<AdmissibleClaim> = [
      {
        label: "the unrolled rewrite",
        graph: Loop(dim("n"), W(1000)),
        authoredAdmissible: true,
      },
    ]
    const violations = checkAdmissibleClaimsAgreeWithDerivation(
      claims,
      constraints,
      budget,
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("the unrolled rewrite")
    expect(violations[0]).toContain("authored as admissible")
    expect(violations[0]).toContain("derives not admissible")
  })

  it("flags a claim authored as not admissible when the derivation disagrees", () => {
    const claims: ReadonlyArray<AdmissibleClaim> = [
      {
        label: "the linear rewrite",
        graph: Loop(dim("n"), W(1)),
        authoredAdmissible: false,
      },
    ]
    const violations = checkAdmissibleClaimsAgreeWithDerivation(
      claims,
      constraints,
      budget,
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("authored as not admissible")
    expect(violations[0]).toContain("derives admissible")
  })

  it("checks every claim independently — one disagreement among several does not silence or duplicate the rest", () => {
    const claims: ReadonlyArray<AdmissibleClaim> = [
      {
        label: "agrees",
        graph: Loop(dim("n"), W(1)),
        authoredAdmissible: true,
      },
      {
        label: "disagrees",
        graph: Loop(dim("n"), W(1000)),
        authoredAdmissible: true,
      },
    ]
    const violations = checkAdmissibleClaimsAgreeWithDerivation(
      claims,
      constraints,
      budget,
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("disagrees")
  })
})
