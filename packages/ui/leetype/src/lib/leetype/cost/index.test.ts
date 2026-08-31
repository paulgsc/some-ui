import type {
  CostExpr,
  CostGraph,
  Dimension,
  Monomial,
} from "@leetype/lib/leetype/cost"
import {
  constantCost,
  costOf,
  dim,
  dimensionsOfGraph,
  dimensionsOfMonomial,
  logDim,
  Loop,
  multiplyMonomials,
  ONE,
  parseMonomial,
  printMonomial,
  scaleCost,
  Seq,
  sumCost,
  W,
} from "@leetype/lib/leetype/cost"
import { assertNever } from "some-ui-utils"
import { describe, expect, it } from "vitest"

describe("costOf — the canon's own worked instances (Def. 2.1, Def. 2.2)", () => {
  it("W(c) is a constant term", () => {
    expect(costOf(W(5))).toEqual(constantCost(5))
  })

  it("Loop(n, W(1)) is n", () => {
    expect(costOf(Loop(dim("n"), W(1)))).toEqual([
      { coefficient: 1, monomial: dim("n") },
    ])
  })

  // Loop(n, Seq(Loop(n, W(1)), Loop(n², W(1)))) — the epic's (#1198) and the
  // story's (#1209) own worked instance: n(n + n²) = n² + n³, dominant term
  // Θ(n³). Reducing the sum to its dominant term is G2's job (Cor. 2.1); what
  // G1 owes is the un-reduced symbolic sum this asserts.
  it("Loop(n, Seq(Loop(n, W(1)), Loop(n^2, W(1)))) = n^2 + n^3", () => {
    const graph = Loop(
      dim("n"),
      Seq(Loop(dim("n"), W(1)), Loop(dim("n", 2), W(1)))
    )
    expect(costOf(graph)).toEqual([
      { coefficient: 1, monomial: dim("n", 2) },
      { coefficient: 1, monomial: dim("n", 3) },
    ])
  })

  // Remark 2.1's own counterexample to the naive "depth k implies O(n^k)"
  // reading: two siblings, n and n³, inside an outer n-loop give
  // n(n + n³) = n² + n⁴ — not n·n·n³ = n⁵.
  it("Loop(n, Seq(Loop(n, W(1)), Loop(n^3, W(1)))) = n^2 + n^4, not n^5 (Rem. 2.1)", () => {
    const graph = Loop(
      dim("n"),
      Seq(Loop(dim("n"), W(1)), Loop(dim("n", 3), W(1)))
    )
    expect(costOf(graph)).toEqual([
      { coefficient: 1, monomial: dim("n", 2) },
      { coefficient: 1, monomial: dim("n", 4) },
    ])
    expect(costOf(graph)).not.toEqual([
      { coefficient: 1, monomial: dim("n", 5) },
    ])
  })
})

describe("Monomial — print and parse round-trip", () => {
  const cases: ReadonlyArray<[string, Monomial]> = [
    ["1", ONE],
    ["n", dim("n")],
    ["n^2", dim("n", 2)],
    ["log n", logDim("n")],
    ["m", dim("m")],
    ["(log n)^2", logDim("n", 2)],
    // Factors print in the monomial's normalized (sorted) order, regardless
    // of the order they were multiplied in — "m" sorts before "n^2".
    ["m * n^2", multiplyMonomials(dim("n", 2), dim("m"))],
  ]

  it.each(cases)(
    "prints %s in the notation an author would write",
    (text, monomial) => {
      expect(printMonomial(monomial)).toBe(text)
    }
  )

  it.each(cases)("parses %s back to the same monomial", (text, monomial) => {
    expect(parseMonomial(text)).toEqual(monomial)
  })

  // A dimension name `parseMonomial` cannot read back would silently break
  // the round-trip this module documents: `printMonomial` would still emit
  // it, but `parseMonomial` would throw on the result. Rejected at
  // construction instead, so every monomial `dim`/`logDim` can build is one
  // `parseMonomial` can read.
  it("rejects a dimension name the parser could not read back", () => {
    expect(() => dim("input-size")).toThrow(/not a valid dimension name/)
    expect(() => logDim("input size")).toThrow(/not a valid dimension name/)
  })
})

// Generated terms for the two property tests below: every combination of two
// dimensions and three exponents, as a small grid rather than one-off
// literals — the same "generated, not hand-picked" bar
// `crates/leetype_wasm/tests/invariants.rs` holds for its own invariants.
const GENERATED_DIMENSIONS: ReadonlyArray<Dimension> = ["n", "m"]
const GENERATED_EXPONENTS: ReadonlyArray<number> = [1, 2, 3]

function leaf(dimension: Dimension, exponent: number): CostGraph {
  return Loop(dim(dimension, exponent), W(1))
}

function costsEqual(a: CostExpr, b: CostExpr): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A plausible bug: `Seq` returns only its first child's cost, as if
 * "and then" meant "just run the first thing." Siblings should add
 * (Def. 2.2) — this never does, so it must disagree with `costOf` on every
 * generated case below where a later sibling contributes.
 */
function costOfWithBrokenSeq(graph: CostGraph): CostExpr {
  switch (graph.kind) {
    case "work": {
      return constantCost(graph.cost)
    }
    case "seq": {
      return graph.children.length > 0
        ? costOfWithBrokenSeq(graph.children[0]!)
        : constantCost(0)
    }
    case "loop": {
      return scaleCost(graph.repetition, costOfWithBrokenSeq(graph.body))
    }
    default: {
      return assertNever(graph)
    }
  }
}

describe("costOf — sibling composition adds (Def. 2.2, Seq), negative control", () => {
  for (const d1 of GENERATED_DIMENSIONS) {
    for (const e1 of GENERATED_EXPONENTS) {
      for (const d2 of GENERATED_DIMENSIONS) {
        for (const e2 of GENERATED_EXPONENTS) {
          it(`Seq(${d1}^${e1}, ${d2}^${e2}) sums, and dropping a sibling gets it wrong`, () => {
            const graph = Seq(leaf(d1, e1), leaf(d2, e2))
            const real = costOf(graph)

            expect(real).toEqual(
              sumCost(costOf(leaf(d1, e1)), costOf(leaf(d2, e2)))
            )

            // The negative control: a Seq that forgets its second sibling
            // must produce a different (wrong) answer, proving the assertion
            // above actually depends on summing rather than passing anyway.
            expect(costsEqual(costOfWithBrokenSeq(graph), real)).toBe(false)
          })
        }
      }
    }
  }
})

/**
 * Another plausible bug: `Loop` returns its body's cost unchanged, as if
 * repetition never happened. Nesting should multiply (Def. 2.2) — this
 * never does, so it must disagree with `costOf` on every generated case
 * below (every generated exponent is positive).
 */
function costOfWithBrokenLoop(graph: CostGraph): CostExpr {
  switch (graph.kind) {
    case "work": {
      return constantCost(graph.cost)
    }
    case "seq": {
      return sumCost(...graph.children.map(costOfWithBrokenLoop))
    }
    case "loop": {
      return costOfWithBrokenLoop(graph.body)
    }
    default: {
      return assertNever(graph)
    }
  }
}

describe("costOf — nesting multiplies (Def. 2.2, Loop), negative control", () => {
  for (const d of GENERATED_DIMENSIONS) {
    for (const e1 of GENERATED_EXPONENTS) {
      for (const e2 of GENERATED_EXPONENTS) {
        it(`Loop(${d}^${e1}, Loop(${d}^${e2}, W(1))) multiplies into ${d}^${e1 + e2}, and skipping repetition gets it wrong`, () => {
          const graph = Loop(dim(d, e1), Loop(dim(d, e2), W(1)))
          const real = costOf(graph)

          // Nested Loops combine into one, exponents added — a property of
          // the algebra independent of how any single Loop node is scored,
          // since the left side nests two Loop nodes and the right side
          // authors one.
          expect(real).toEqual(costOf(Loop(dim(d, e1 + e2), W(1))))

          expect(costsEqual(costOfWithBrokenLoop(graph), real)).toBe(false)
        })
      }
    }
  }
})

describe("dimensionsOfMonomial / dimensionsOfGraph — the identifiers R2 (#1205) checks a constraint's own dimension against", () => {
  it("a bare monomial names its own dimension", () => {
    expect(dimensionsOfMonomial(dim("n", 2))).toEqual(new Set(["n"]))
  })

  it("the constant monomial ONE names no dimension", () => {
    expect(dimensionsOfMonomial(ONE)).toEqual(new Set())
  })

  it("a product monomial names every distinct factor's dimension once", () => {
    expect(
      dimensionsOfMonomial(multiplyMonomials(dim("n"), dim("m", 2)))
    ).toEqual(new Set(["n", "m"]))
  })

  it("W alone names no dimension — only a Loop's repetition does", () => {
    expect(dimensionsOfGraph(W(5))).toEqual(new Set())
  })

  it("collects a Loop's own dimension", () => {
    expect(dimensionsOfGraph(Loop(dim("n"), W(1)))).toEqual(new Set(["n"]))
  })

  it("collects every dimension across nested Seq/Loop, deduplicated", () => {
    const graph = Loop(
      dim("n"),
      Seq(Loop(dim("n"), W(1)), Loop(dim("m", 2), W(1)))
    )
    expect(dimensionsOfGraph(graph)).toEqual(new Set(["n", "m"]))
  })
})
