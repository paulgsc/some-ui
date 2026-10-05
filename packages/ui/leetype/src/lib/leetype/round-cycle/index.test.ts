import { dim, logDim, Loop, Seq, W } from "@leetype/lib/leetype/cost"
import type { CostGraph } from "@leetype/lib/leetype/cost"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import type { Commitment } from "@leetype/types/commitment"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import type { DiffHunk } from "@leetype/types/exercise"
import type { DiffSetMember } from "@leetype/types/round"
import { describe, expect, it } from "vitest"

import type {
  RescueCandidate,
  RoundCyclePosingDiffSelection,
  RoundCycleState,
  RoundDiffOption,
} from "./index"
import {
  checkUnrescuableExplanationsResolve,
  initialRoundCycleState,
  nextRoundCycleState,
} from "./index"

const CONSTRAINTS: ConstraintSet = [
  { dimension: "n", operator: "<=", bound: 1000 },
]
const BUDGET: Budget = { operations: 1000 }

/** A minimal, schema-shaped hunk — its content is never read by anything under test. */
function hunkAt(path: string): DiffHunk {
  return {
    path,
    oldStart: 1,
    newStart: 1,
    segments: [{ kind: "addition", text: `${path}();` }],
  }
}

function memberOf(
  propositionId: PropositionId,
  path: string,
  admissible = true
): DiffSetMember {
  return admissible
    ? { hunk: hunkAt(path), propositionId, admissible: true }
    : {
        hunk: hunkAt(path),
        propositionId,
        admissible: false,
        distractorStatement: `reuses ${propositionId}'s own rewrite here.`,
      }
}

/**
 * A diff option costing `cost` at `n = 1000` as `Loop(dim("n"), W(cost /
 * 1000))`, so a tighter `n` bound can rescue it. Pass `graph` for a cost
 * independent of every bounded dimension (`W(cost)`, CW-P16's shape).
 * `authoredAdmissible` is settable independently of the derived outcome
 * (Rem. 8.0).
 */
function diffOptionOf(args: {
  propositionId: PropositionId
  cost: number
  authoredAdmissible?: boolean
  rescueCandidates?: ReadonlyArray<RescueCandidate>
  explanationPropositionId?: PropositionId
  graph?: CostGraph
}): RoundDiffOption {
  return {
    member: memberOf(
      args.propositionId,
      args.propositionId,
      args.authoredAdmissible ?? true
    ),
    graph: args.graph ?? Loop(dim("n"), W(args.cost / 1000)),
    rescueCandidates: args.rescueCandidates ?? [],
    explanationPropositionId: args.explanationPropositionId ?? "CW-P16",
  }
}

/**
 * A `posingDiffSelection` round over an inadmissible `A` (2000 against a
 * budget of 1000) presenting exactly `diffOptions`, which `response.diff`
 * must be one of by reference.
 */
function posingRoundWith(
  diffOptions: ReadonlyArray<RoundDiffOption>
): RoundCyclePosingDiffSelection {
  const state = initialRoundCycleState(
    Loop(dim("n"), W(2)),
    CONSTRAINTS,
    BUDGET,
    diffOptions
  )
  if (state.phase !== "posingDiffSelection") {
    throw new Error("fixture setup: expected posingDiffSelection")
  }
  return state
}

const ABSTAIN: Commitment = { kind: "abstain" }

/** A candidate `C″` bounding `n` (C's only dimension) at `bound`. */
function rescueAt(
  bound: number,
  dimension = "n",
  operator: "<=" | ">=" = "<="
): RescueCandidate {
  return {
    constraints: [{ dimension, operator, bound }],
    propositionId: "CW-P4",
  }
}

/** Selects `diff` in `round` (by default, a round offering only it). */
function select(
  diff: RoundDiffOption,
  commitment: Commitment = ABSTAIN,
  round: RoundCyclePosingDiffSelection = posingRoundWith([diff])
): ReturnType<typeof nextRoundCycleState> {
  return nextRoundCycleState(round, { kind: "selectDiff", diff, commitment })
}

describe("initialRoundCycleState — Def. 8.1's entry point", () => {
  it("case 1: an admissible A advances directly, with no diffs presented", () => {
    const admissibleGraph = Loop(dim("n"), W(1)) // costs 1000 at n=1000, within budget
    const state = initialRoundCycleState(
      admissibleGraph,
      CONSTRAINTS,
      BUDGET,
      []
    )
    expect(state.phase).toBe("admissibleAdvance")
  })

  it("case 2: an inadmissible A presents D", () => {
    const inadmissibleGraph = Loop(dim("n"), W(2)) // costs 2000, over budget
    const diffOptions = [diffOptionOf({ propositionId: "CW-P1", cost: 500 })]
    const state = initialRoundCycleState(
      inadmissibleGraph,
      CONSTRAINTS,
      BUDGET,
      diffOptions
    )
    expect(state.phase).toBe("posingDiffSelection")
    if (state.phase !== "posingDiffSelection") throw new Error("unreachable")
    expect(state.diffOptions).toBe(diffOptions)
  })
})

describe("nextRoundCycleState — Def. 8.1 cases 3/4 and Def. 8.2", () => {
  it("case 3: a diff that restores admissibility advances", () => {
    const diff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
    const next = select(diff, { kind: "choice", id: "CW-P1" })
    expect(next.phase).toBe("admissibleAdvance")
  })

  it("case 4 -> Def. 8.2 case 1: a rescuing constraint exists among the candidates", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P2",
      cost: 2000, // still over budget after the diff
      // A distractor (1500 does not rescue), then the real rescue (400).
      rescueCandidates: [rescueAt(1500), rescueAt(400)],
    })
    const commitment: Commitment = { kind: "choice", id: "CW-P2" }
    const next = select(diff, commitment)
    expect(next.phase).toBe("posingRescueSelection")
    if (next.phase !== "posingRescueSelection") throw new Error("unreachable")
    expect(next.pinnedDiff).toBe(diff)
    expect(next.pinnedCommitment).toBe(commitment)
    expect(next.rescueCandidates).toBe(diff.rescueCandidates)
  })

  it("case 4 -> Def. 8.2 case 2: no authored candidate demonstrates a rescue", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P16",
      cost: 5000,
      // W(5000) ignores n, so no candidate bound can rescue it.
      graph: W(5000),
      rescueCandidates: [rescueAt(1)],
      explanationPropositionId: "CW-P16",
    })
    const commitment: Commitment = { kind: "choice", id: "CW-P9" }
    const next = select(diff, commitment)
    expect(next.phase).toBe("posingUnrescuableExplanation")
    if (next.phase !== "posingUnrescuableExplanation") {
      throw new Error("unreachable")
    }
    expect(next.pinnedDiff).toBe(diff)
    expect(next.pinnedCommitment).toBe(commitment)
    expect(next.explanationPropositionId).toBe("CW-P16")
  })

  it("Def. 8.2's case selection is derived from any assignment of the bounds satisfying the relation — not from candidate order", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P2",
      cost: 2000,
      // The one rescuing candidate is last, not first.
      rescueCandidates: [rescueAt(1500), rescueAt(1200), rescueAt(400)],
    })
    expect(select(diff).phase).toBe("posingRescueSelection")
  })

  // Candidates are validated before any is tested, and the case split comes
  // from testing them against isAdmissible, never from the graph's algebra
  // (see nextRoundCycleState's doc comment for the counterexamples).
  describe("Def. 8.2's rescue candidates are validated before being tested", () => {
    it.each([
      {
        name: "bounds a different dimension set than C",
        rescueCandidates: [rescueAt(1, "m")],
      },
      {
        // evaluate reads only the number, but ConstraintDiffSchema rejects it.
        name: "changes a dimension's comparison operator",
        rescueCandidates: [rescueAt(400, "n", ">=")],
      },
      {
        // A valid rescue first must not short-circuit validating the rest.
        name: "is malformed even when a valid rescuing one appears first",
        rescueCandidates: [rescueAt(400), rescueAt(1, "m")],
      },
    ])("throws when a rescue candidate $name", ({ rescueCandidates }) => {
      const diff = diffOptionOf({
        propositionId: "CW-P2",
        cost: 2000,
        graph: Loop(dim("n"), W(2)),
        rescueCandidates,
      })
      expect(() => select(diff)).toThrow(
        /not a valid Def\. 3\.2 constraint diff/
      )
    })

    describe("graphs whose algebra alone would misclassify them", () => {
      it("n² + (log₂ n)² with no candidate resolves to case 2 (real minimum ~0.9 exceeds a 0.5 budget, but this module never computes that)", () => {
        const graph = Seq(Loop(dim("n", 2), W(1)), Loop(logDim("n", 2), W(1)))
        const diff = diffOptionOf({
          propositionId: "CW-P2",
          cost: 2000,
          graph,
          explanationPropositionId: "CW-P16",
        })
        const round = {
          ...posingRoundWith([diff]),
          budget: { operations: 0.5 },
        }
        expect(select(diff, ABSTAIN, round).phase).toBe(
          "posingUnrescuableExplanation"
        )
      })

      it("a bare log factor with a sub-1 candidate rescues, even though the log term is negative there", () => {
        // log2(0.5) = -1: the term is negative at the candidate.
        const graph = Seq(W(2), Loop(logDim("n"), W(2)))
        const diff = diffOptionOf({
          propositionId: "CW-P2",
          cost: 2000,
          graph,
          rescueCandidates: [rescueAt(0.5)],
        })
        const round = { ...posingRoundWith([diff]), budget: { operations: 1 } }
        expect(select(diff, ABSTAIN, round).phase).toBe("posingRescueSelection")
      })

      it("a bare log factor with no candidate resolves to case 2, even though bound 1 would trivially rescue it", () => {
        // Bound 1 would rescue it, but with no authored candidate this
        // module cannot find it: a disclosed limitation.
        const graph = Loop(logDim("n"), W(1))
        const diff = diffOptionOf({
          propositionId: "CW-P2",
          cost: 2000,
          graph,
        })
        const round = {
          ...posingRoundWith([diff]),
          budget: { operations: 0.5 },
        }
        expect(select(diff, ABSTAIN, round).phase).toBe(
          "posingUnrescuableExplanation"
        )
      })
    })
  })

  // Def. 8.2's second disjunct ("grows in a dimension C does not bound"),
  // caught before isAdmissible, which would throw on it.
  it("routes a diff whose graph repeats over an unbounded dimension straight to Def. 8.2 case 2", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P14",
      cost: 2000,
      graph: Loop(dim("m"), W(2)), // C bounds "n", not "m"
    })
    expect(select(diff).phase).toBe("posingUnrescuableExplanation")
  })

  // Loop(dim("m"), W(0)) normalizes away in costOf, so "m" is never needed.
  it("does not misroute a diff whose graph structurally repeats over an unbounded dimension when that repetition's own cost normalizes to zero", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P14",
      cost: 2000,
      graph: Seq(Loop(dim("n"), W(2)), Loop(dim("m"), W(0))), // C bounds only "n"
      rescueCandidates: [rescueAt(400)],
    })
    expect(select(diff).phase).toBe("posingRescueSelection")
  })

  it("throws when response.diff is not one of this round's own diffOptions", () => {
    const offered = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
    const stale = diffOptionOf({ propositionId: "CW-P9", cost: 500 })
    expect(() => select(stale, ABSTAIN, posingRoundWith([offered]))).toThrow(
      /not one of this round's own diffOptions/
    )
  })

  // Rem. 8.0: the derived relation wins over the author's claim.
  describe("Rem. 8.0 — the branch never reads an authored claim", () => {
    it("a diff authored as admissible, but not derived-admissible, still routes to Def. 8.2", () => {
      const diff = diffOptionOf({
        propositionId: "CW-P16",
        cost: 5000, // derived: not admissible, independent of every dimension
        graph: W(5000),
        authoredAdmissible: true, // authored: claims otherwise
      })
      expect(select(diff).phase).not.toBe("admissibleAdvance")
    })

    it("a diff authored as not admissible, but derived-admissible, still advances", () => {
      const diff = diffOptionOf({
        propositionId: "CW-P2",
        cost: 500, // derived: admissible
        authoredAdmissible: false, // authored: claims otherwise
      })
      expect(select(diff).phase).toBe("admissibleAdvance")
    })
  })

  // Nor does it read the learner's guess. admissibleAdvance pins no
  // commitment, so the results are fully identical.
  it("the outcome is identical regardless of the learner's proposition guess, including abstention", () => {
    const diff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
    const round = posingRoundWith([diff])
    const withChoice = select(diff, { kind: "choice", id: "CW-P9" }, round)
    const withAbstain = select(diff, ABSTAIN, round)
    expect(withChoice).toEqual(withAbstain)
  })
})

/** One diff per Def. 8.1/8.2 branch, all offered by `posingRound`. */
const restoringDiff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
const rescuableDiff = diffOptionOf({
  propositionId: "CW-P2",
  cost: 2000,
  rescueCandidates: [rescueAt(400)],
})
const unrescuableDiff = diffOptionOf({
  propositionId: "CW-P16",
  cost: 5000,
  graph: W(5000), // CW-P16's shape: independent of every bounded dimension
})
const posingRound = posingRoundWith([
  restoringDiff,
  rescuableDiff,
  unrescuableDiff,
])
const admissibleFromStart = initialRoundCycleState(
  Loop(dim("n"), W(1)),
  CONSTRAINTS,
  BUDGET,
  []
)

describe("Thm. 8.1 — the cycle has no absorbing failure state", () => {
  const branches: ReadonlyArray<{
    readonly name: string
    readonly result: RoundCycleState
  }> = [
    { name: "case 1 (admissible from the start)", result: admissibleFromStart },
    {
      name: "case 3 (selection restores admissibility)",
      result: select(restoringDiff, ABSTAIN, posingRound),
    },
    {
      name: "case 4 -> Def. 8.2 case 1 (a rescuing constraint exists)",
      result: select(rescuableDiff, ABSTAIN, posingRound),
    },
    {
      name: "case 4 -> Def. 8.2 case 2 (no rescuing constraint exists)",
      result: select(unrescuableDiff, ABSTAIN, posingRound),
    },
  ]

  it("every branch produces a defined successor state — no dead end", () => {
    for (const branch of branches) {
      expect(branch.result, branch.name).toBeDefined()
      expect(typeof branch.result.phase, branch.name).toBe("string")
    }
  })

  it("no branch's successor recurs the state it was driven from (posingDiffSelection)", () => {
    for (const branch of branches) {
      expect(branch.result.phase, branch.name).not.toBe("posingDiffSelection")
    }
  })

  it("case 2's own entry (posing) is itself never one of case 3/4's successors — the four named states are pairwise distinct in kind", () => {
    const phases = new Set(branches.map((branch) => branch.result.phase))
    phases.add(posingRound.phase)
    // Four distinct successor kinds (case 1/3's shared "admissibleAdvance",
    // Def. 8.2's two cases) plus the case-2 entry state itself.
    expect(phases.size).toBe(4)
  })

  // Compile-time totality is `__type-fixtures__/round-cycle-state.fixtures.ts`
  // (TSC-STATIC1).
})

describe("Prop. 8.1 — the cycle terminates only by the learner leaving", () => {
  const FORBIDDEN_KEYS = [
    "win",
    "isWin",
    "won",
    "complete",
    "completed",
    "completionPercentage",
    "progress",
    "score",
    "exhausted",
    "corpusExhausted",
  ]

  it("no returned state carries a win, completion, or corpus-exhaustion field", () => {
    for (const state of [
      posingRound,
      admissibleFromStart,
      select(restoringDiff, ABSTAIN, posingRound),
      select(rescuableDiff, ABSTAIN, posingRound),
      select(unrescuableDiff, ABSTAIN, posingRound),
    ]) {
      const keys = Object.keys(state)
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, JSON.stringify(state.phase)).not.toContain(forbidden)
      }
    }
  })

  it("driving the cycle indefinitely never yields a terminal or undefined state", () => {
    // Repeatedly picking the unrescuable diff always names a successor.
    let state: RoundCycleState = posingRound
    for (let round = 0; round < 25; round += 1) {
      expect(state).toBeDefined()
      if (state.phase !== "posingDiffSelection") break // a successor (Thm. 8.1)
      state = select(unrescuableDiff, ABSTAIN, state)
    }
    expect(state.phase).not.toBe("posingDiffSelection")
  })
})

describe("checkUnrescuableExplanationsResolve", () => {
  const ACTIVE_ENTRY: PropositionRegisterEntry = {
    id: "CW-P16",
    title: "A cost independent of the bounds is not a constraint problem",
    statement: "…",
    status: "active",
  }
  const RETIRED_ENTRY: PropositionRegisterEntry = {
    id: "CW-P1",
    title: "Sequential composition adds",
    statement: "…",
    status: "retired",
  }
  const REGISTER: Readonly<Record<string, PropositionRegisterEntry>> = {
    "CW-P16": ACTIVE_ENTRY,
    "CW-P1": RETIRED_ENTRY,
  }

  it("is clean when every explanationPropositionId resolves to an active entry", () => {
    const options = [diffOptionOf({ propositionId: "CW-P2", cost: 5000 })]
    expect(checkUnrescuableExplanationsResolve(options, REGISTER)).toEqual([])
  })

  it("flags a dangling explanationPropositionId — not in the register at all", () => {
    // Not "CW-Pn"-shaped, so check-proposition-citations.ts ignores it.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately injecting a value PropositionId's own type rules out, to prove checkUnrescuableExplanationsResolve's runtime dangling-id check fires even though RoundDiffOption's compile-time type would normally prevent this.
    const badId = "not-a-real-proposition-id" as PropositionId
    const options = [
      diffOptionOf({
        propositionId: "CW-P2",
        cost: 5000,
        explanationPropositionId: badId,
      }),
    ]
    const violations = checkUnrescuableExplanationsResolve(options, REGISTER)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(badId)
    expect(violations[0]).toContain("not in the proposition register")
  })

  it("flags an explanationPropositionId that resolves but is retired", () => {
    const options = [
      diffOptionOf({
        propositionId: "CW-P2",
        cost: 5000,
        explanationPropositionId: "CW-P1",
      }),
    ]
    const violations = checkUnrescuableExplanationsResolve(options, REGISTER)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("CW-P1")
    expect(violations[0]).toContain("retired")
  })

  it("checks every option independently and reports each violation once", () => {
    const options = [
      diffOptionOf({ propositionId: "CW-P2", cost: 5000 }), // clean
      diffOptionOf({
        propositionId: "CW-P3",
        cost: 5000,
        explanationPropositionId: "CW-P1", // retired
      }),
    ]
    const violations = checkUnrescuableExplanationsResolve(options, REGISTER)
    expect(violations).toHaveLength(1)
  })

  it("defaults to the real live register, where CW-P16 (Def. 8.2's own named exemplar) is active", () => {
    const options = [diffOptionOf({ propositionId: "CW-P2", cost: 5000 })]
    expect(checkUnrescuableExplanationsResolve(options)).toEqual([])
    expect(PROPOSITION_REGISTER["CW-P16"].status).toBe("active")
  })
})
