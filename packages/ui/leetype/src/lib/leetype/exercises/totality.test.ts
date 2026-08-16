import type { ConstructionStep } from "@leetype/types/exercise"
import { ConstructionStepSchema } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import { ALL_FIXTURE_EXERCISES, FIXTURE_EXERCISE_ID } from "."
import { linearize } from "./obligation-graph"
import type { Obligation, ObligationGraph } from "./obligation-graph"
import {
  assertGraphIsTotal,
  MAX_OBLIGATIONS_PER_ROUTE,
  validateTotality,
} from "./totality"
import { fallbackRoute, WORKED_ROUTE_BRIDGE } from "./worked-route"

/** Mirrors `obligation-graph.test.ts`'s and `worked-route.test.ts`'s
 * fixture — see either for why `entry-01`/`02`/`09`/`10` are excluded. */
function realCommitmentStep(id: string): ConstructionStep {
  const exercise = ALL_FIXTURE_EXERCISES.find(
    (candidate) => candidate.id === FIXTURE_EXERCISE_ID
  )
  if (exercise === undefined) {
    throw new Error(
      `fixture setup: "${FIXTURE_EXERCISE_ID}" is not in the corpus.`
    )
  }
  const step = exercise.steps.find((candidate) => candidate.id === id)
  if (step === undefined) {
    throw new Error(
      `fixture setup: "${id}" is not a step of ${FIXTURE_EXERCISE_ID}.`
    )
  }
  const result = ConstructionStepSchema.safeParse(step)
  if (!result.success) {
    throw new Error(`fixture setup: "${id}" is not a valid ConstructionStep.`)
  }
  return result.data
}

function obligationFrom(
  step: ConstructionStep,
  requires: ReadonlyArray<string>
): Obligation {
  const { id: _id, ...content } = step
  return {
    claim: "representation",
    requires,
    sinkRoutes: {},
    fallbackBridge: WORKED_ROUTE_BRIDGE,
    content,
  }
}

function realEntryGraph(): ObligationGraph {
  return {
    problem: FIXTURE_EXERCISE_ID,
    title: "The Entry API",
    targetConcepts: ["Entry API"],
    entry: "entry-03-place",
    fallback: WORKED_ROUTE_BRIDGE,
    nodes: {
      "entry-03-place": obligationFrom(
        realCommitmentStep("entry-03-place"),
        []
      ),
      "entry-04-fill": obligationFrom(realCommitmentStep("entry-04-fill"), [
        "entry-03-place",
      ]),
      "entry-05-mutate": obligationFrom(realCommitmentStep("entry-05-mutate"), [
        "entry-04-fill",
      ]),
      "entry-06-compose": obligationFrom(
        realCommitmentStep("entry-06-compose"),
        ["entry-03-place", "entry-04-fill", "entry-05-mutate"]
      ),
      "entry-07-transfer": obligationFrom(
        realCommitmentStep("entry-07-transfer"),
        ["entry-06-compose"]
      ),
      "entry-08-generalize": obligationFrom(
        realCommitmentStep("entry-08-generalize"),
        ["entry-07-transfer"]
      ),
    },
  }
}

/** A trivial, well-formed one-node graph — the base every malformed
 * fixture below starts from and deviates from in exactly one way. */
function trivialObligation(requires: ReadonlyArray<string> = []): Obligation {
  return {
    claim: "representation",
    requires,
    sinkRoutes: {},
    fallbackBridge: WORKED_ROUTE_BRIDGE,
    content: {
      goal: "Do the one thing.",
      concepts: ["fixture"],
      obligation: "a trivial obligation for validator fixtures",
      blocks: [
        { kind: "transition", before: "a", after: "b" },
        { kind: "typing", source: "the_thing()", language: "rust" },
      ],
    },
  }
}

function trivialGraph(): ObligationGraph {
  return {
    problem: "trivial",
    title: "Trivial",
    targetConcepts: [],
    entry: "only",
    fallback: WORKED_ROUTE_BRIDGE,
    nodes: { only: trivialObligation() },
  }
}

describe("validateTotality — the real corpus", () => {
  it("finds no violations in the real entry-API commitment chain", () => {
    expect(validateTotality(realEntryGraph())).toEqual([])
  })

  it("assertGraphIsTotal does not throw on the real graph", () => {
    expect(() => assertGraphIsTotal(realEntryGraph())).not.toThrow()
  })
})

describe("validateTotality — deliberately malformed fixtures", () => {
  it("rejects a cyclic requires edge — the check that the check works", () => {
    const graph: ObligationGraph = {
      problem: "cyclic",
      title: "Cyclic",
      targetConcepts: [],
      entry: "a",
      fallback: WORKED_ROUTE_BRIDGE,
      nodes: {
        a: trivialObligation(["b"]),
        b: trivialObligation(["a"]),
      },
    }
    const violations = validateTotality(graph)
    expect(violations.some((v) => v.includes("cycle"))).toBe(true)
  })

  it("rejects an edge targeting a node absent from the graph", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: { only: trivialObligation(["no-such-node"]) },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) => v.includes("is not a node in this graph"))
    ).toBe(true)
  })

  it("rejects more than one root", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: trivialObligation(),
        "second-root": trivialObligation(),
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) =>
        v.includes("more than one node has no prerequisite")
      )
    ).toBe(true)
  })

  it("rejects more than one terminal — branches that never reconverge", () => {
    const graph: ObligationGraph = {
      problem: "forked",
      title: "Forked",
      targetConcepts: [],
      entry: "entry",
      fallback: WORKED_ROUTE_BRIDGE,
      nodes: {
        entry: trivialObligation(),
        "branch-a": trivialObligation(["entry"]),
        "branch-b": trivialObligation(["entry"]),
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) =>
        v.includes("more than one node is required by nothing")
      )
    ).toBe(true)
  })

  it("rejects a node whose fallbackBridge is empty", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: { only: { ...trivialObligation(), fallbackBridge: "" } },
    }
    const violations = validateTotality(graph)
    expect(violations.some((v) => v.includes("fallbackBridge is empty"))).toBe(
      true
    )
  })

  it("rejects a sink route whose bridge is empty", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: { ...trivialObligation(), sinkRoutes: { "some-sink": "" } },
      },
    }
    const violations = validateTotality(graph)
    expect(violations.some((v) => v.includes("has no bridge"))).toBe(true)
  })

  it("rejects a diagnostic node with no concrete observation", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: {
          ...trivialObligation(),
          content: {
            goal: "Fix the loop.",
            concepts: ["fixture"],
            // rationale present (marks this content as diagnostic-family)
            // but no trace block — the concrete observation itself is
            // missing, which DiagnosticStepSchema requires.
            rationale: {
              cause: "cursor never advances",
              whyRepairDiscriminates: "incrementing cursor is the only fix",
            },
            blocks: [
              { kind: "typing", source: "cursor += 1;", language: "rust" },
            ],
          },
        },
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) =>
        v.includes("does not satisfy DiagnosticStepSchema")
      )
    ).toBe(true)
  })

  it("rejects a construction node whose content fails ConstructionStepSchema", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: {
          ...trivialObligation(),
          // Only a witness, no other evidence block — violates
          // ConstructionStepSchema's own "at least one block besides its
          // witness" refinement.
          content: {
            goal: "Do the one thing.",
            concepts: ["fixture"],
            obligation: "a trivial obligation",
            blocks: [
              { kind: "typing", source: "the_thing()", language: "rust" },
            ],
          },
        },
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) =>
        v.includes("does not satisfy ConstructionStepSchema")
      )
    ).toBe(true)
  })

  it("rejects a witness entirely wrapped in context — nothing to reveal", () => {
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: {
          ...trivialObligation(),
          content: {
            goal: "Do the one thing.",
            concepts: ["fixture"],
            obligation: "a trivial obligation",
            blocks: [
              { kind: "transition", before: "a", after: "b" },
              {
                kind: "typing",
                source: "‹let x = the_thing();›",
                language: "rust",
              },
            ],
          },
        },
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) => v.includes("nothing for the learner to reveal"))
    ).toBe(true)
  })

  it("rejects a witness with a dangling unmatched ‹ — context runs to EOF in the real engine", () => {
    // program.rs's own test (an_unterminated_context_span_runs_to_the_end_
    // of_the_source) establishes this: an opener with no matching closer
    // is context through the end of the source, not left as typed text.
    // A naive `replace(/‹[^›]*›/g, "")` only matches a *closed* span, so
    // it would leave a dangling opener counted as typed — the opposite of
    // the engine, and exactly wrong for an emptiness check.
    const graph: ObligationGraph = {
      ...trivialGraph(),
      nodes: {
        only: {
          ...trivialObligation(),
          content: {
            goal: "Do the one thing.",
            concepts: ["fixture"],
            obligation: "a trivial obligation",
            blocks: [
              { kind: "transition", before: "a", after: "b" },
              { kind: "typing", source: "‹answer", language: "rust" },
            ],
          },
        },
      },
    }
    const violations = validateTotality(graph)
    expect(
      violations.some((v) => v.includes("nothing for the learner to reveal"))
    ).toBe(true)
  })

  it("rejects a graph over the static node-count bound", () => {
    const nodes: Record<string, Obligation> = {}
    const ids = Array.from(
      { length: MAX_OBLIGATIONS_PER_ROUTE + 1 },
      (_, i) => `node-${String(i).padStart(2, "0")}`
    )
    ids.forEach((id, i) => {
      nodes[id] = trivialObligation(i === 0 ? [] : [ids[i - 1]!])
    })
    const graph: ObligationGraph = {
      problem: "oversized",
      title: "Oversized",
      targetConcepts: [],
      entry: ids[0]!,
      fallback: WORKED_ROUTE_BRIDGE,
      nodes,
    }
    const violations = validateTotality(graph)
    expect(violations.some((v) => v.includes("exceeds the static bound"))).toBe(
      true
    )
  })

  it("assertGraphIsTotal throws, naming the graph and listing violations", () => {
    const graph: ObligationGraph = {
      problem: "cyclic",
      title: "Cyclic",
      targetConcepts: [],
      entry: "a",
      fallback: WORKED_ROUTE_BRIDGE,
      nodes: { a: trivialObligation(["b"]), b: trivialObligation(["a"]) },
    }
    expect(() => assertGraphIsTotal(graph)).toThrow(/"cyclic" is not total/)
  })
})

describe("no sink can lock progression — proven, not assumed", () => {
  it("routing is unaffected by arbitrary sink data — fallbackRoute never reads it", () => {
    const graph = realEntryGraph()
    const before = linearize(graph)

    const withGarbageSinkData: ObligationGraph = {
      ...graph,
      fallback: "garbage-that-does-not-exist",
      nodes: Object.fromEntries(
        Object.entries(graph.nodes).map(([id, node]) => [
          id,
          {
            ...node,
            sinkRoutes: { "some-sink": "a-bridge-nothing-declares" },
            fallbackBridge: "also-garbage",
          },
        ])
      ),
    }

    const after = linearize(withGarbageSinkData)
    expect(after.steps).toEqual(before.steps)

    // And the worked route itself, not just the ordinary one.
    expect(fallbackRoute(withGarbageSinkData, "entry-05-mutate").steps).toEqual(
      fallbackRoute(graph, "entry-05-mutate").steps
    )
  })
})
