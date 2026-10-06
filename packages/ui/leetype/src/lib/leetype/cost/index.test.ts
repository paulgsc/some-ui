import type {
  CostExpr,
  CostGraph,
  CostPath,
  Dimension,
  Monomial,
} from "@leetype/lib/leetype/cost"
import {
  constantCost,
  costOf,
  costOfPath,
  dim,
  dimensionsOfGraph,
  dimensionsOfMonomial,
  dominantPaths,
  dominantTerms,
  logDim,
  Loop,
  monomialOfPath,
  multiplyMonomials,
  ONE,
  parseMonomial,
  paths,
  printClass,
  printMonomial,
  scaleCost,
  Seq,
  sumCost,
  W,
} from "@leetype/lib/leetype/cost"
import { assertNever } from "@some-ui/core-utils"
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

  // n(n + n²) = n² + n³, un-reduced (reduction is Cor. 2.1's job).
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

  // Rem. 2.1: n(n + n³) = n² + n⁴, not the "depth implies power" n⁵.
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
    // Factors print in sorted order, whatever the multiplication order.
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

  // Rejected at construction so every buildable monomial parses back.
  it("rejects a dimension name the parser could not read back", () => {
    expect(() => dim("input-size")).toThrow(/not a valid dimension name/)
    expect(() => logDim("input size")).toThrow(/not a valid dimension name/)
  })
})

// A small generated grid for the two property tests below, not hand-picked literals.
const GENERATED_DIMENSIONS: ReadonlyArray<Dimension> = ["n", "m"]
const GENERATED_EXPONENTS: ReadonlyArray<number> = [1, 2, 3]

function leaf(dimension: Dimension, exponent: number): CostGraph {
  return Loop(dim(dimension, exponent), W(1))
}

function costsEqual(a: CostExpr, b: CostExpr): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A plausible bug for the negative control: `Seq` keeps only its first child's cost. */
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

            // Negative control: proves the assertion depends on summing.
            expect(costsEqual(costOfWithBrokenSeq(graph), real)).toBe(false)
          })
        }
      }
    }
  }
})

/** A plausible bug for the negative control: `Loop` ignores its repetition. */
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

          // Two nested Loop nodes equal one with exponents added.
          expect(real).toEqual(costOf(Loop(dim(d, e1 + e2), W(1))))

          expect(costsEqual(costOfWithBrokenLoop(graph), real)).toBe(false)
        })
      }
    }
  }
})

describe("dimensionsOfMonomial / dimensionsOfGraph — what a constraint's dimension is checked against", () => {
  it.each<[string, Monomial, Array<Dimension>]>([
    ["a bare monomial names its own dimension", dim("n", 2), ["n"]],
    ["the constant monomial ONE names no dimension", ONE, []],
    [
      "a product monomial names every distinct factor's dimension once",
      multiplyMonomials(dim("n"), dim("m", 2)),
      ["n", "m"],
    ],
  ])("%s", (_name, monomial, dimensions) => {
    expect(dimensionsOfMonomial(monomial)).toEqual(new Set(dimensions))
  })

  it.each<[string, CostGraph, Array<Dimension>]>([
    ["W alone names no dimension — only a Loop's repetition does", W(5), []],
    ["collects a Loop's own dimension", Loop(dim("n"), W(1)), ["n"]],
    [
      "collects every dimension across nested Seq/Loop, deduplicated",
      Loop(dim("n"), Seq(Loop(dim("n"), W(1)), Loop(dim("m", 2), W(1)))),
      ["n", "m"],
    ],
  ])("%s", (_name, graph, dimensions) => {
    expect(dimensionsOfGraph(graph)).toEqual(new Set(dimensions))
  })
})

describe("paths — every root-to-leaf path (Thm. 2.1)", () => {
  it("a bare W is one path with no loops", () => {
    const leaf = W(5)
    const [path] = paths(leaf)
    expect(paths(leaf)).toHaveLength(1)
    expect(path!.loops).toEqual([])
    expect(path!.leaf).toBe(leaf)
  })

  it("Seq branches into one path per child — a disjoint union, per Thm. 2.1's own proof", () => {
    const a = W(1)
    const b = W(2)
    const result = paths(Seq(a, b))
    expect(result).toHaveLength(2)
    expect(result.map((path) => path.leaf)).toEqual([a, b])
  })

  it("Loop prefixes its own node onto every path through its body", () => {
    const outer = Loop(dim("n"), Seq(W(1), W(2)))
    const result = paths(outer)
    expect(result).toHaveLength(2)
    for (const path of result) {
      expect(path.loops).toEqual([outer])
    }
  })

  it("carries the exact node references from G, not copies — what makes a CostPath renderable", () => {
    const leafNode = W(1)
    const innerLoop = Loop(dim("n"), leafNode)
    const graph = Loop(dim("m"), innerLoop)
    const [path] = paths(graph)
    expect(path!.loops[0]).toBe(graph)
    expect(path!.loops[1]).toBe(innerLoop)
    expect(path!.leaf).toBe(leafNode)
  })
})

describe("costOfPath — Thm. 2.1's own identity: summing every path's contribution reconstructs costOf(G)", () => {
  // Two independent computations, over varied shapes and leaf coefficients.
  const GRAPHS: ReadonlyArray<CostGraph> = [
    W(5),
    Seq(W(2), W(3)),
    Loop(dim("n"), W(4)),
    Loop(dim("n"), Seq(Loop(dim("n"), W(2)), Loop(dim("n", 2), W(3)))),
    Seq(
      Loop(dim("n"), W(1)),
      Loop(dim("m"), Seq(W(4), Loop(dim("n", 2), W(2))))
    ),
  ]

  it.each(GRAPHS)(
    "reconstructs costOf(%#) from summed path contributions",
    (graph) => {
      const reconstructed = sumCost(...paths(graph).map(costOfPath))
      expect(reconstructed).toEqual(costOf(graph))
    }
  )
})

describe("dominantPaths — Def. 2.3 / Cor. 2.1, Rem. 2.1's own instance", () => {
  it("n(n + n^3)'s dominant path has degree 4 (Θ(n⁴)), never degree 5 (Rem. 2.1)", () => {
    const graph = Loop(
      dim("n"),
      Seq(Loop(dim("n"), W(1)), Loop(dim("n", 3), W(1)))
    )
    const dominant: ReadonlyArray<CostPath> = dominantPaths(graph)
    expect(dominant).toHaveLength(1)
    expect(monomialOfPath(dominant[0]!)).toEqual(dim("n", 4))
    expect(monomialOfPath(dominant[0]!)).not.toEqual(dim("n", 5))
  })

  it("returns every tied path — a set, not a singleton a caller could mistake for THE dominant path (Def. 2.3)", () => {
    const graph = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n", 2), W(1)))
    expect(dominantPaths(graph)).toHaveLength(2)
  })

  it("a single-leaf graph's one path is trivially the dominant one", () => {
    const graph = W(7)
    const dominant = dominantPaths(graph)
    expect(dominant).toHaveLength(1)
    expect(dominant[0]!.leaf).toBe(graph)
  })

  it("n * log n strictly dominates n — a log factor tie-breaks a pow-degree tie, never ties it", () => {
    const graph = Seq(
      Loop(dim("n"), W(1)),
      Loop(multiplyMonomials(dim("n"), logDim("n")), W(1))
    )
    const dominant = dominantPaths(graph)
    expect(dominant).toHaveLength(1)
    expect(monomialOfPath(dominant[0]!)).toEqual(
      multiplyMonomials(dim("n"), logDim("n"))
    )
  })

  // A zero-cost path is absent from costOf(G), so it cannot dominate.
  it("excludes a zero-cost path from dominance even when its degree is higher", () => {
    const zeroPath = Loop(dim("n", 2), W(0))
    const graph = Seq(zeroPath, Loop(dim("n"), W(1)))
    expect(costOf(graph)).toEqual([{ coefficient: 1, monomial: dim("n") }])

    const dominant = dominantPaths(graph)
    expect(dominant).toHaveLength(1)
    expect(monomialOfPath(dominant[0]!)).toEqual(dim("n"))
    expect(dominant[0]!.loops).not.toContain(zeroPath)
  })

  it("a graph whose every path costs 0 has no dominant path — T(G) is identically 0", () => {
    const graph = Seq(Loop(dim("n", 2), W(0)), Loop(dim("n"), W(0)))
    expect(costOf(graph)).toEqual([])
    expect(dominantPaths(graph)).toEqual([])
  })
})

describe("dominantTerms / printClass — G3's own derivation (Prop. 2.1)", () => {
  it("a single-term expression's own term is trivially dominant", () => {
    const cost = costOf(Loop(dim("n", 2), W(1)))
    expect(dominantTerms(cost)).toEqual(cost)
    expect(printClass(cost)).toBe("Θ(n^2)")
  })

  it("picks the higher-degree term out of a multi-term sum (n^2 + n^3 is dominated by n^3)", () => {
    const cost = costOf(
      Loop(dim("n"), Seq(Loop(dim("n"), W(1)), Loop(dim("n", 2), W(1))))
    )
    expect(cost).toEqual([
      { coefficient: 1, monomial: dim("n", 2) },
      { coefficient: 1, monomial: dim("n", 3) },
    ])
    expect(dominantTerms(cost)).toEqual([
      { coefficient: 1, monomial: dim("n", 3) },
    ])
    expect(printClass(cost)).toBe("Θ(n^3)")
  })

  it("drops the coefficient — Ax. 3.1's coarseness means a constant factor was never part of the class", () => {
    const cost = costOf(Loop(dim("n"), W(1000)))
    expect(printClass(cost)).toBe("Θ(n)")
  })

  it('prints a genuine tie between distinct same-degree monomials as a sum (Def. 2.3, "need not be unique")', () => {
    const cost = costOf(
      Seq(
        Loop(dim("n", 2), W(1)),
        Loop(multiplyMonomials(dim("n"), dim("m")), W(1))
      )
    )
    expect(dominantTerms(cost)).toHaveLength(2)
    // Terms and factors print in sorted key order, not authoring order.
    expect(printClass(cost)).toBe("Θ(m * n + n^2)")
  })

  // m grows independently of n, so neither term may be dropped.
  it("retains both terms of an unequal-degree cross-dimension sum rather than ranking by summed exponent", () => {
    const cost = costOf(Seq(Loop(dim("m", 2), W(1)), Loop(dim("n", 3), W(1))))
    expect(dominantTerms(cost)).toHaveLength(2)
    expect(printClass(cost)).toBe("Θ(m^2 + n^3)")
  })

  it("a higher-degree term in one dimension set does not eliminate a lower-degree term in a different one (n^5 vs n*m)", () => {
    const cost = costOf(
      Seq(
        Loop(dim("n", 5), W(1)),
        Loop(multiplyMonomials(dim("n"), dim("m")), W(1))
      )
    )
    expect(dominantTerms(cost)).toHaveLength(2)
    // "m * n" (dims {n, m}) sorts before "n^5" (dims {n}) by monomial key.
    expect(printClass(cost)).toBe("Θ(m * n + n^5)")
  })

  it("T(G) identically 0 has no dominant term and prints Θ(0) rather than throwing", () => {
    const cost = costOf(W(0))
    expect(cost).toEqual([])
    expect(dominantTerms(cost)).toEqual([])
    expect(printClass(cost)).toBe("Θ(0)")
  })

  it("a log factor's degree still tie-breaks a pow-degree tie, same as dominantPaths", () => {
    const cost = costOf(
      Seq(
        Loop(dim("n"), W(1)),
        Loop(multiplyMonomials(dim("n"), logDim("n")), W(1))
      )
    )
    // Factors print in normalized order — "log:n" sorts before "pow:n".
    expect(printClass(cost)).toBe("Θ(log n * n)")
  })
})
