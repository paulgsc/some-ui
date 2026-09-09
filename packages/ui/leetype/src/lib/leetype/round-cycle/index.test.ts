import { dim, Loop, W } from "@leetype/lib/leetype/cost"
import type { CostGraph } from "@leetype/lib/leetype/cost"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import type { Commitment } from "@leetype/types/commitment"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import type { DiffHunk } from "@leetype/types/exercise"
import type { DiffSetMember } from "@leetype/types/round"
import { assertNever } from "some-ui-utils"
import { describe, expect, it } from "vitest"

import type { RescueCandidate, RoundCycleState, RoundDiffOption } from "./index"
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
 * A diff option whose cost graph evaluates to `cost` at `CONSTRAINTS`'s own
 * bound (`n = 1000`) — `Loop(dim("n"), W(cost / 1000))` costs exactly
 * `cost` there, and (unlike a bare `W(cost)`) still *responds* to a tighter
 * `n` bound, so callers can build a diff that a rescuing constraint can
 * plausibly fix. Pass `graph` directly to override this — the unrescuable
 * tests below need a cost genuinely independent of every bounded dimension
 * (`CW-P16`'s own shape, Def. 8.2 case 2), which a bare `W(cost)` gives and
 * no tightening of `n` can ever change.
 *
 * `admissible` is the diff's own authored claim (Cor. 5.1/Prop. 2.1),
 * independently settable from the derived outcome — several tests below
 * rely on being able to disagree with it on purpose (Rem. 8.0).
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

const ABSTAIN: Commitment = { kind: "abstain" }

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
  const posingRound = initialRoundCycleState(
    Loop(dim("n"), W(2)), // inadmissible: costs 2000 > 1000
    CONSTRAINTS,
    BUDGET,
    []
  )
  if (posingRound.phase !== "posingDiffSelection") {
    throw new Error("fixture setup: expected posingDiffSelection")
  }

  it("case 3: a diff that restores admissibility advances", () => {
    const diff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
    const next = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: { kind: "choice", id: "CW-P1" },
    })
    expect(next.phase).toBe("admissibleAdvance")
  })

  it("case 4 -> Def. 8.2 case 1: a rescuing constraint exists among the candidates", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P2",
      cost: 2000, // still over budget after the diff
      rescueCandidates: [
        // A distractor candidate that does not actually rescue.
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 1500 }],
          propositionId: "CW-P4",
        },
        // The real rescuing candidate: a tighter bound brings cost within budget.
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 400 }],
          propositionId: "CW-P4",
        },
      ],
    })
    const next = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: ABSTAIN,
    })
    expect(next.phase).toBe("posingRescueSelection")
    if (next.phase !== "posingRescueSelection") throw new Error("unreachable")
    expect(next.pinnedDiff).toBe(diff)
    expect(next.rescueCandidates).toBe(diff.rescueCandidates)
  })

  it("case 4 -> Def. 8.2 case 2: no candidate rescues", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P16",
      cost: 5000,
      // A bare W(5000): CW-P16's own shape — a cost with a term
      // independent of every bounded dimension. Unlike a Loop(dim("n"), …)
      // graph, no tightening of n's bound can ever bring this within
      // budget, however tight the candidate.
      graph: W(5000),
      rescueCandidates: [
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 1 }],
          propositionId: "CW-P4",
        },
      ],
      explanationPropositionId: "CW-P16",
    })
    const next = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: ABSTAIN,
    })
    expect(next.phase).toBe("posingUnrescuableExplanation")
    if (next.phase !== "posingUnrescuableExplanation") {
      throw new Error("unreachable")
    }
    expect(next.pinnedDiff).toBe(diff)
    expect(next.explanationPropositionId).toBe("CW-P16")
  })

  it("Def. 8.2's case selection is derived from any assignment of the bounds satisfying the relation — not from candidate order", () => {
    const diff = diffOptionOf({
      propositionId: "CW-P2",
      cost: 2000,
      rescueCandidates: [
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 1500 }],
          propositionId: "CW-P4",
        },
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 1200 }],
          propositionId: "CW-P4",
        },
        // The one rescuing candidate is last, not first.
        {
          constraints: [{ dimension: "n", operator: "<=", bound: 400 }],
          propositionId: "CW-P4",
        },
      ],
    })
    const next = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: ABSTAIN,
    })
    expect(next.phase).toBe("posingRescueSelection")
  })

  // Rem. 8.0's own lesson, restated one level up from "branching on r":
  // the derived relation wins regardless of what the diff's author
  // claimed about it.
  describe("Rem. 8.0 — the branch never reads an authored claim", () => {
    it("a diff authored as admissible, but not derived-admissible, still routes to Def. 8.2", () => {
      const diff = diffOptionOf({
        propositionId: "CW-P2",
        cost: 5000, // derived: not admissible
        authoredAdmissible: true, // authored: claims otherwise
      })
      const next = nextRoundCycleState(posingRound, {
        kind: "selectDiff",
        diff,
        commitment: ABSTAIN,
      })
      expect(next.phase).not.toBe("admissibleAdvance")
    })

    it("a diff authored as not admissible, but derived-admissible, still advances", () => {
      const diff = diffOptionOf({
        propositionId: "CW-P2",
        cost: 500, // derived: admissible
        authoredAdmissible: false, // authored: claims otherwise
      })
      const next = nextRoundCycleState(posingRound, {
        kind: "selectDiff",
        diff,
        commitment: ABSTAIN,
      })
      expect(next.phase).toBe("admissibleAdvance")
    })
  })

  // Rem. 8.0's lesson, restated a second way: the branch never reads the
  // learner's own proposition guess either — only which diff was picked.
  it("the outcome is identical regardless of the learner's proposition guess, including abstention", () => {
    const diff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
    const withChoice = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: { kind: "choice", id: "CW-P9" }, // an arbitrary, even wrong, guess
    })
    const withAbstain = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff,
      commitment: ABSTAIN,
    })
    expect(withChoice).toEqual(withAbstain)
  })
})

describe("Thm. 8.1 — the cycle has no absorbing failure state", () => {
  // Every named branch in Def. 8.1 (cases 1-4) and Def. 8.2 (its own two
  // cases), driven from a fresh classification through to its successor.
  const admissibleFromStart = initialRoundCycleState(
    Loop(dim("n"), W(1)),
    CONSTRAINTS,
    BUDGET,
    []
  )

  const posingRound = (() => {
    const state = initialRoundCycleState(
      Loop(dim("n"), W(2)),
      CONSTRAINTS,
      BUDGET,
      []
    )
    if (state.phase !== "posingDiffSelection") {
      throw new Error("fixture setup: expected posingDiffSelection")
    }
    return state
  })()

  const restoringDiff = diffOptionOf({ propositionId: "CW-P1", cost: 500 })
  const rescuableDiff = diffOptionOf({
    propositionId: "CW-P2",
    cost: 2000,
    rescueCandidates: [
      {
        constraints: [{ dimension: "n", operator: "<=", bound: 400 }],
        propositionId: "CW-P4",
      },
    ],
  })
  const unrescuableDiff = diffOptionOf({
    propositionId: "CW-P16",
    cost: 5000,
    graph: W(5000), // independent of every bounded dimension — CW-P16's own shape
    rescueCandidates: [
      {
        constraints: [{ dimension: "n", operator: "<=", bound: 1 }],
        propositionId: "CW-P4",
      },
    ],
  })

  const branches: ReadonlyArray<{
    readonly name: string
    readonly result: RoundCycleState
  }> = [
    { name: "case 1 (admissible from the start)", result: admissibleFromStart },
    {
      name: "case 3 (selection restores admissibility)",
      result: nextRoundCycleState(posingRound, {
        kind: "selectDiff",
        diff: restoringDiff,
        commitment: ABSTAIN,
      }),
    },
    {
      name: "case 4 -> Def. 8.2 case 1 (a rescuing constraint exists)",
      result: nextRoundCycleState(posingRound, {
        kind: "selectDiff",
        diff: rescuableDiff,
        commitment: ABSTAIN,
      }),
    },
    {
      name: "case 4 -> Def. 8.2 case 2 (no rescuing constraint exists)",
      result: nextRoundCycleState(posingRound, {
        kind: "selectDiff",
        diff: unrescuableDiff,
        commitment: ABSTAIN,
      }),
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

  // Compile-time totality: if a fifth phase were ever added to
  // RoundCycleState without updating this switch, this file fails to
  // compile — the same exhaustiveness discipline `assertNever` enforces
  // throughout this workspace, applied here to stand in for Thm. 8.1's own
  // "the transition function is total."
  it("RoundCycleState's phases are exhaustively known", () => {
    function describePhase(state: RoundCycleState): string {
      switch (state.phase) {
        case "posingDiffSelection":
        case "admissibleAdvance":
        case "posingRescueSelection":
        case "posingUnrescuableExplanation": {
          return state.phase
        }
        default: {
          return assertNever(state)
        }
      }
    }
    for (const branch of branches) {
      expect(() => describePhase(branch.result)).not.toThrow()
    }
  })
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

  const posingRound = (() => {
    const state = initialRoundCycleState(
      Loop(dim("n"), W(2)),
      CONSTRAINTS,
      BUDGET,
      []
    )
    if (state.phase !== "posingDiffSelection") {
      throw new Error("fixture setup: expected posingDiffSelection")
    }
    return state
  })()

  it("no returned state carries a win, completion, or corpus-exhaustion field", () => {
    const admissible = initialRoundCycleState(
      Loop(dim("n"), W(1)),
      CONSTRAINTS,
      BUDGET,
      []
    )
    const restoring = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff: diffOptionOf({ propositionId: "CW-P1", cost: 500 }),
      commitment: ABSTAIN,
    })
    const rescuable = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff: diffOptionOf({
        propositionId: "CW-P2",
        cost: 2000,
        rescueCandidates: [
          {
            constraints: [{ dimension: "n", operator: "<=", bound: 400 }],
            propositionId: "CW-P4",
          },
        ],
      }),
      commitment: ABSTAIN,
    })
    const unrescuable = nextRoundCycleState(posingRound, {
      kind: "selectDiff",
      diff: diffOptionOf({
        propositionId: "CW-P16",
        cost: 5000,
        graph: W(5000),
      }),
      commitment: ABSTAIN,
    })

    for (const state of [
      posingRound,
      admissible,
      restoring,
      rescuable,
      unrescuable,
    ]) {
      const keys = Object.keys(state)
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, JSON.stringify(state.phase)).not.toContain(forbidden)
      }
    }
  })

  it("driving the cycle indefinitely never yields a terminal or undefined state", () => {
    // A learner who keeps failing to restore admissibility with a diff
    // whose cost is independent of the bound (CW-P16's own shape): the
    // cycle keeps naming a successor every time, never stalling or
    // returning something the caller must special-case as "done."
    let state: RoundCycleState = posingRound
    for (let round = 0; round < 25; round += 1) {
      expect(state).toBeDefined()
      if (state.phase !== "posingDiffSelection") {
        // Reached a genuine successor phase — Thm. 8.1's own claim, not a
        // dead end this loop needs to recover from.
        break
      }
      state = nextRoundCycleState(state, {
        kind: "selectDiff",
        diff: diffOptionOf({
          propositionId: "CW-P16",
          cost: 5000,
          graph: W(5000),
        }),
        commitment: ABSTAIN,
      })
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
    // Deliberately not "CW-Pn"-shaped: scripts/check-proposition-citations.ts
    // scans every tracked file for that literal pattern, and this file is
    // not one of the proposition-register module's own tests.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately injecting a value PropositionId's own type rules out, to prove checkUnrescuableExplanationsResolve's runtime dangling-id check fires even though RoundDiffOption's compile-time type would normally prevent this.
    const badId = "not-a-real-proposition-id" as PropositionId
    const options = [
      diffOptionOf({
        propositionId: "CW-P2",
        cost: 5000,
        // Deliberately malformed test data: a real corpus author's typo
        // would not type-check as PropositionId, but the register lookup
        // itself must still be defensive — the same posture checkCitations
        // takes toward a dangling `Citation.id`.
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
