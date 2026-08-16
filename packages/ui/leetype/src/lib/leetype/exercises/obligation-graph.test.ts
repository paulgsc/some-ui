import type { ConstructionStep, Step } from "@leetype/types/exercise"
import { ConstructionStepSchema } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import { ALL_FIXTURE_EXERCISES, FIXTURE_EXERCISE_ID } from "."
import type { Obligation, ObligationGraph } from "./obligation-graph"
import { linearize } from "./obligation-graph"

/**
 * The real `rust-hashmap-entry` exercise's six obligation-bearing steps
 * (LTY-FAMILIES A4), re-expressed as an `ObligationGraph` rather than an
 * authored array. `entry-01`/`02` (setup, no `obligation`) and
 * `entry-09`/`10` (the diagnostic handoff) are outside this graph by
 * construction — neither is an obligation node under R2's own claim
 * taxonomy, and folding them in is a decision for whoever wires this
 * module into the seed corpus, not something this test needs to settle.
 */
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
    fallbackBridge: "worked-route",
    content,
  }
}

/**
 * The real dependency shape: `entry-06-compose` is the one obligation that
 * requires more than its immediate predecessor — it composes all three of
 * the place/fill/mutate commitments into one expression, so it legitimately
 * requires all three, not just the last.
 */
function realEntryGraph(): ObligationGraph {
  return {
    problem: FIXTURE_EXERCISE_ID,
    title: "The Entry API",
    targetConcepts: ["Entry API"],
    entry: "entry-03-place",
    fallback: "worked-route",
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

const COMMITMENT_IDS = [
  "entry-03-place",
  "entry-04-fill",
  "entry-05-mutate",
  "entry-06-compose",
  "entry-07-transfer",
  "entry-08-generalize",
]

describe("linearize", () => {
  it("emits an Exercise byte-identical to the hand-authored commitment chain", () => {
    const exercise = linearize(realEntryGraph())
    const expectedSteps: Array<Step> = COMMITMENT_IDS.map((id) =>
      realCommitmentStep(id)
    )

    expect(exercise.id).toBe(FIXTURE_EXERCISE_ID)
    expect(exercise.steps).toEqual(expectedSteps)
  })

  it("recovers dependency order from requires, not from node registration order", () => {
    // IDs deliberately chosen so alphabetical order and dependency order
    // disagree ("a-last" sorts before "z-first"): a linearizer that fell
    // back to id order or object-key order on any tie would get this
    // backwards. Registered in the graph literal in reverse-of-correct
    // order too, for the same reason.
    const graph: ObligationGraph = {
      problem: "synthetic",
      title: "Synthetic ordering probe",
      targetConcepts: [],
      entry: "z-first",
      fallback: "worked-route",
      nodes: {
        "a-last": {
          claim: "transfer",
          requires: ["z-first"],
          sinkRoutes: {},
          fallbackBridge: "worked-route",
          content: {
            goal: "Second commitment.",
            concepts: ["fixture"],
            obligation: "the second commitment follows the first",
            blocks: [{ kind: "typing", source: "second()", language: "rust" }],
          },
        },
        "z-first": {
          claim: "representation",
          requires: [],
          sinkRoutes: {},
          fallbackBridge: "worked-route",
          content: {
            goal: "First commitment.",
            concepts: ["fixture"],
            obligation: "the first commitment has no prerequisite",
            blocks: [{ kind: "typing", source: "first()", language: "rust" }],
          },
        },
      },
    }

    expect(linearize(graph).steps.map((step) => step.id)).toEqual([
      "z-first",
      "a-last",
    ])
  })

  it("follows a reversed requires edge against id order — proving it's read, not ignored", () => {
    // Every real id in this fixture happens to sort alphabetically into
    // dependency order ("entry-03" before "entry-04", and so on), which
    // means a linearizer that silently fell back to id order instead of
    // requires would still pass the byte-identical test above by
    // coincidence. This test breaks that coincidence on purpose: swap which
    // of the last two commitments requires the other, so the correct
    // topological order now *disagrees* with id order, and confirm the
    // output follows the edge rather than the ids.
    const graph = realEntryGraph()
    const swapped: ObligationGraph = {
      ...graph,
      nodes: {
        ...graph.nodes,
        "entry-07-transfer": {
          ...graph.nodes["entry-07-transfer"]!,
          requires: ["entry-08-generalize"],
        },
        "entry-08-generalize": {
          ...graph.nodes["entry-08-generalize"]!,
          requires: ["entry-06-compose"],
        },
      },
    }

    const order = linearize(swapped).steps.map((step) => step.id)
    expect(order.indexOf("entry-08-generalize")).toBeLessThan(
      order.indexOf("entry-07-transfer")
    )
  })

  it("throws on a cycle rather than looping forever", () => {
    const graph: ObligationGraph = {
      problem: "synthetic-cycle",
      title: "Cyclic",
      targetConcepts: [],
      entry: "a",
      fallback: "worked-route",
      nodes: {
        a: {
          claim: "representation",
          requires: ["b"],
          sinkRoutes: {},
          fallbackBridge: "worked-route",
          content: {
            goal: "A.",
            concepts: ["fixture"],
            obligation: "a",
            blocks: [{ kind: "typing", source: "a()", language: "rust" }],
          },
        },
        b: {
          claim: "representation",
          requires: ["a"],
          sinkRoutes: {},
          fallbackBridge: "worked-route",
          content: {
            goal: "B.",
            concepts: ["fixture"],
            obligation: "b",
            blocks: [{ kind: "typing", source: "b()", language: "rust" }],
          },
        },
      },
    }

    expect(() => linearize(graph)).toThrow(/requires itself/)
  })

  it("throws when requires names a node absent from the graph", () => {
    const graph: ObligationGraph = {
      problem: "synthetic-dangling",
      title: "Dangling",
      targetConcepts: [],
      entry: "a",
      fallback: "worked-route",
      nodes: {
        a: {
          claim: "representation",
          requires: ["no-such-node"],
          sinkRoutes: {},
          fallbackBridge: "worked-route",
          content: {
            goal: "A.",
            concepts: ["fixture"],
            obligation: "a",
            blocks: [{ kind: "typing", source: "a()", language: "rust" }],
          },
        },
      },
    }

    expect(() => linearize(graph)).toThrow(/is not a node in this graph/)
  })

  it("throws when entry is not the obligation with no unmet prerequisite", () => {
    const graph = realEntryGraph()
    expect(() => linearize({ ...graph, entry: "entry-08-generalize" })).toThrow(
      /declared as the entry/
    )
  })
})
