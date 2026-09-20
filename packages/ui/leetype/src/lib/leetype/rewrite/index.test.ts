import type { CostGraph } from "@leetype/lib/leetype/cost"
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

import type { EdgeIdentity, Rewrite, RewriteWitness } from "./index"
import {
  classesOf,
  isAdmissibilityRestoring,
  rewriteOf,
  semanticDistance,
} from "./index"

describe("rewriteOf — Thm. 5.1's own pairing", () => {
  it("pairs the before and after graphs verbatim", () => {
    const before = Loop(dim("n"), W(1))
    const after = W(1)
    const rewrite: Rewrite = rewriteOf(before, after)
    expect(rewrite).toEqual({ before, after })
  })
})

describe("classesOf — the before/after Θ-class pair, computed never authored", () => {
  it("derives both classes via printClass(costOf(...)), never a hand-typed string", () => {
    const rewrite = rewriteOf(Loop(dim("n"), W(1)), W(1))
    expect(classesOf(rewrite)).toEqual({ before: "Θ(n)", after: "Θ(1)" })
  })
})

describe("isAdmissibilityRestoring — Def. 5.1's own relation", () => {
  const constraints: ConstraintSet = [
    { dimension: "n", operator: "<=", bound: 1000 },
  ]
  const budget: Budget = { operations: 2000 }

  it("is restoring when the before exceeds budget and the after does not", () => {
    const rewrite = rewriteOf(Loop(dim("n"), W(1000)), Loop(dim("n"), W(1)))
    expect(isAdmissibilityRestoring(rewrite, constraints, budget)).toBe(true)
  })

  it("is not restoring when the before never exceeded budget in the first place", () => {
    const rewrite = rewriteOf(Loop(dim("n"), W(1)), W(1))
    expect(isAdmissibilityRestoring(rewrite, constraints, budget)).toBe(false)
  })

  it("is not restoring when the after still exceeds budget", () => {
    const rewrite = rewriteOf(Loop(dim("n"), W(1000)), Loop(dim("n"), W(999)))
    expect(isAdmissibilityRestoring(rewrite, constraints, budget)).toBe(false)
  })
})

// Def. 5.2's own worked examples — CW-P5 and CW-P7, cited by G4's own
// acceptance criteria. Both restructure a nested Loop into a Seq of two
// Loops, so none of the before graph's edges survive at their old
// position — every one of them counts toward the distance.
describe("semanticDistance — Def. 5.2's own worked examples", () => {
  it("CW-P5 · nm → n + m: preprocessing substitutes space for repeated search", () => {
    // Before: a linear search of m items, once per n outer iterations.
    const before = Loop(dim("n"), Loop(dim("m"), W(1)))
    // After: one Θ(m) preprocessing pass, then n expected-Θ(1) lookups.
    const after = Seq(Loop(dim("m"), W(1)), Loop(dim("n"), W(1)))
    expect(printClass(costOf(before))).toBe("Θ(m * n)")
    expect(printClass(costOf(after))).toBe("Θ(m + n)")
    expect(semanticDistance(before, after)).toBe(2)
  })

  it("CW-P7 · n² → n log n: sorting collapses pairwise comparison", () => {
    // Before: every pair compared directly.
    const before = Loop(dim("n"), Loop(dim("n"), W(1)))
    // After: sort once (n log n), then a single adjacency scan (n).
    const after = Seq(
      Loop(multiplyMonomials(dim("n"), logDim("n")), W(1)),
      Loop(dim("n"), W(1))
    )
    expect(printClass(costOf(before))).toBe("Θ(n^2)")
    expect(printClass(costOf(after))).toBe("Θ(log n * n)")
    expect(semanticDistance(before, after)).toBe(2)
  })

  it("is 0 for two structurally identical graphs", () => {
    const graph = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n"), W(1)))
    expect(semanticDistance(graph, graph)).toBe(0)
  })

  it("counts only the one edge whose repetition changed, position held fixed", () => {
    // Prop. 5.1(b)'s own counterexample graph — see the describe block
    // below. A single-edge rewrite is a small semantic distance regardless
    // of the (large, upward) effect it has on the class — Rem. 5.1's point
    // that minimality is not about how much the class moves.
    const before = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n"), W(1)))
    const after = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n", 3), W(1)))
    expect(semanticDistance(before, after)).toBe(1)
  })
})

// Review finding on this PR (chatgpt-codex-connector): the same (before,
// after) graph pair can arise from two different rewrites — adding an
// inner loop (the outer edge untouched) or adding an outer loop and
// pushing the original into its body (the original edge moved) — and no
// function of the two graphs alone can distinguish them. `identify` is the
// escape hatch: `EdgeIdentity`'s own doc comment explains why.
describe("semanticDistance — edge correspondence across a rewrite (EdgeIdentity)", () => {
  it("the default, position-keyed identity cannot see either interpretation as a move — documents the limitation, does not hide it", () => {
    const addInnerLoop = Loop(dim("n"), Loop(dim("n"), W(1)))
    const pushOriginalDown = Loop(dim("n"), Loop(dim("n"), W(1)))
    const before = Loop(dim("n"), W(1))
    expect(semanticDistance(before, addInnerLoop)).toBe(0)
    expect(semanticDistance(before, pushOriginalDown)).toBe(0)
  })

  it("an authored identity that recognizes a genuinely new inner loop reports the outer edge as unchanged", () => {
    const before = Loop(dim("n"), W(1))
    // The outer loop is unchanged; a brand new inner loop is added around
    // its former body. Both graphs' root sits at position "", so an
    // identity keying the root position as a stable id (regardless of
    // which object it is) recognizes them as the same edge.
    const after = Loop(dim("n"), Loop(dim("n"), W(1)))
    const identify: EdgeIdentity = (_loop, position) =>
      position === "" ? "outer" : position
    expect(semanticDistance(before, after, identify)).toBe(0)
  })

  it("an authored identity that tracks the original loop object reports it as moved", () => {
    const original = Loop(dim("n"), W(1))
    const before: CostGraph = original
    // The original loop, reused by object reference, is pushed down into a
    // brand new outer loop's body — a real structural move, even though
    // its own repetition expression never changes.
    const after = Loop(dim("n"), original)
    const identify: EdgeIdentity = (loop, position) =>
      loop === original ? "original" : position
    expect(semanticDistance(before, after, identify)).toBe(1)
  })
})

// Prop. 5.1, in its corrected form (Rem. 5.2) — two tests, not one, so
// nobody re-derives the false two-directional form from the code the way
// the canon's own first draft did.
describe("Prop. 5.1 — an off-dominant-path rewrite cannot reduce Θ(T), but may raise it", () => {
  it("(a) CW-P11: confined to a non-dominant path, the class does not reduce however much code it touches", () => {
    // Θ(n²) dominates; the Θ(n) branch is not dominant. Multiplying that
    // branch's own leaf cost 250× — as large a rewrite as a branch admits
    // without changing its repetition expression's dimension — still cannot
    // reduce the class, because the dominant path is untouched.
    const before = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n"), W(2)))
    const after = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n"), W(500)))
    expect(printClass(costOf(before))).toBe("Θ(n^2)")
    expect(printClass(costOf(after))).toBe("Θ(n^2)")
  })

  it("(b) the negative case: Seq(n², n) → Seq(n², n³) raises the class", () => {
    // The canon's own corrected counterexample (Prop. 5.1's proof): a
    // rewrite off the dominant path can enlarge a dominated path until it
    // dominates, changing Θ(T) upward — the original one-directional claim
    // ("cannot change the class") was wrong, and this is the case that
    // forced the correction.
    const before = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n"), W(1)))
    const after = Seq(Loop(dim("n", 2), W(1)), Loop(dim("n", 3), W(1)))
    expect(printClass(costOf(before))).toBe("Θ(n^2)")
    expect(printClass(costOf(after))).toBe("Θ(n^3)")
  })
})

// knip flags an exported type alias nobody imports by name even when a
// value inferring the same shape is already used (the R4/#1261 handoff's
// own documented trap) — these two annotated consts are that workaround,
// mirroring admissibility/index.test.ts's own pattern for `AdmissibleClaim`.
describe("exported types stay referenced by name", () => {
  it("Rewrite and RewriteWitness both type-check as annotated values", () => {
    const rewrite: Rewrite = rewriteOf(W(1), W(1))
    const witness: RewriteWitness = { rewrite, behaviourPreserving: true }
    expect(witness.behaviourPreserving).toBe(true)
  })
})
