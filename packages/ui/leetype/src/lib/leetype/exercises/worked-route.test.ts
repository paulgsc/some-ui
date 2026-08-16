import type { ConstructionStep } from "@leetype/types/exercise"
import { ConstructionStepSchema } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import { ALL_FIXTURE_EXERCISES, FIXTURE_EXERCISE_ID } from "."
import { linearize } from "./obligation-graph"
import type { Obligation, ObligationGraph } from "./obligation-graph"
import {
  fallbackRoute,
  ObligationGraphSchema,
  ObligationSchema,
  WORKED_ROUTE_BRIDGE,
} from "./worked-route"

/** Mirrors `obligation-graph.test.ts`'s fixture — see that file for why
 * `entry-01`/`02`/`09`/`10` are outside this graph by construction. */
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

const COMMITMENT_IDS = [
  "entry-03-place",
  "entry-04-fill",
  "entry-05-mutate",
  "entry-06-compose",
  "entry-07-transfer",
  "entry-08-generalize",
]

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

describe("ObligationSchema / ObligationGraphSchema", () => {
  it("accepts a well-formed obligation", () => {
    const graph = realEntryGraph()
    const result = ObligationSchema.safeParse(graph.nodes["entry-03-place"])
    expect(result.success).toBe(true)
  })

  it("rejects an obligation with no fallbackBridge", () => {
    const graph = realEntryGraph()
    const { fallbackBridge: _fallbackBridge, ...withoutBridge } =
      graph.nodes["entry-03-place"]!
    const result = ObligationSchema.safeParse(withoutBridge)
    expect(result.success).toBe(false)
  })

  it("rejects an obligation whose fallbackBridge is an empty string", () => {
    const graph = realEntryGraph()
    const result = ObligationSchema.safeParse({
      ...graph.nodes["entry-03-place"]!,
      fallbackBridge: "",
    })
    expect(result.success).toBe(false)
  })

  it("accepts the whole real graph", () => {
    const result = ObligationGraphSchema.safeParse(realEntryGraph())
    expect(result.success).toBe(true)
  })

  it("rejects the whole graph if any single node is missing its fallbackBridge", () => {
    const graph = realEntryGraph()
    const { fallbackBridge: _fallbackBridge, ...withoutBridge } =
      graph.nodes["entry-06-compose"]!
    // Deliberately untyped: `withoutBridge` is missing a required field, so
    // asserting it back to `Obligation` would just silence the checker
    // rather than test it. `safeParse` accepts `unknown` — let it decide.
    const malformed = {
      ...graph,
      nodes: { ...graph.nodes, "entry-06-compose": withoutBridge },
    }
    expect(ObligationGraphSchema.safeParse(malformed).success).toBe(false)
  })
})

describe("fallbackRoute", () => {
  it("is reachable from every node and always ends at the graph's terminal", () => {
    const graph = realEntryGraph()
    const terminalId = linearize(graph).steps.at(-1)!.id

    for (const id of COMMITMENT_IDS) {
      const route = fallbackRoute(graph, id)
      expect(route.steps[0]!.id).toBe(id)
      expect(route.steps.at(-1)!.id).toBe(terminalId)
    }
  })

  it("changes nothing about a step's content — same shape as the ordinary route", () => {
    const graph = realEntryGraph()
    const full = linearize(graph)
    const fromMiddle = fallbackRoute(graph, "entry-05-mutate")

    // The worked route is a suffix, not a rewrite: every step it returns
    // is deep-equal to the same step in the ordinary linearized order,
    // not a variant with extra fields or different content.
    const expectedSuffix = full.steps.slice(
      full.steps.findIndex((step) => step.id === "entry-05-mutate")
    )
    expect(fromMiddle.steps).toEqual(expectedSuffix)
  })

  it("terminates on the maximally-assisted path — escaping at every node still reaches the end", () => {
    // Simulate the worst case R4 will later prove structurally: the
    // learner never fluently resolves a single obligation and escapes
    // every one. Repeatedly ask for the worked route from the current
    // position, "type" only its first step, and move to whatever the
    // route says comes next — never revisiting a node, never looping.
    const graph = realEntryGraph()
    const expectedOrder = linearize(graph).steps.map((step) => step.id)

    const visited: Array<string> = []
    let current: string | undefined = graph.entry
    let guard = 0

    while (current !== undefined) {
      guard += 1
      if (guard > expectedOrder.length + 1) {
        throw new Error(
          "test guard: the maximally-assisted path did not terminate within the node count"
        )
      }
      const route = fallbackRoute(graph, current)
      visited.push(current)
      current = route.steps[1]?.id
    }

    expect(visited).toEqual(expectedOrder)
  })

  it("throws when asked to start from a node absent from the graph", () => {
    const graph = realEntryGraph()
    expect(() => fallbackRoute(graph, "no-such-node")).toThrow(
      /is not a node in this graph's linearized order/
    )
  })
})
