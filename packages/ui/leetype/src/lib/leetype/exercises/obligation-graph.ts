import type {
  ConstructionStep,
  DiagnosticStep,
  Exercise,
} from "@leetype/types/exercise"

/**
 * The obligation graph, one arrow to the left of the shim.
 *
 * ```text
 * obligation graph → linearized route → Exercise
 * ```
 *
 * A step's position becomes a *consequence* of what it requires, not a
 * hand-picked index. `requires` is the edge `types/exercise.ts` refused to
 * put on `Exercise` ("an edge nothing branches on is a claim without a
 * consumer"); here `linearize()` consumes it.
 *
 * Not sink inference, routing policy or UI: `sinkRoutes` and
 * `fallbackBridge` give LTY-ROUTE somewhere to attach bridges, and this
 * module never reads them.
 *
 * Not exported from `./index.ts` or wired into the seed corpus; exercised by
 * its own tests. Replacing a hand-authored `Exercise` with `linearize()`'s
 * output is a decision for whoever authors the next problem.
 */

// Not exported until something outside this module names them.
type ObligationId = string
type SinkId = string
type BridgeId = string

/**
 * What kind of decision an obligation's witness commits the learner to.
 * Closed: an eighth is a change argued on its own merits.
 */
type ObligationClaim =
  | "representation"
  | "invariant"
  | "transition"
  | "progress"
  | "termination"
  | "complexity"
  | "transfer"

/**
 * One node: everything `linearize()` needs to emit it as a step, plus edges
 * LTY-ROUTE reads. `content` omits `id` because the node's key in
 * `ObligationGraph.nodes` is its only name. Both step families are admitted
 * so totality can check diagnostic nodes too.
 */
export type Obligation = {
  claim: ObligationClaim
  /** The obligations this one assumes are already discharged. Read by `linearize()`. */
  requires: ReadonlyArray<ObligationId>
  /** Read by LTY-ROUTE R3/R4/R5, not by this module. */
  sinkRoutes: Partial<Record<SinkId, BridgeId>>
  /** Read by LTY-ROUTE R3/R4, not by this module. */
  fallbackBridge: BridgeId
  content: Omit<ConstructionStep, "id"> | Omit<DiagnosticStep, "id">
}

/**
 * A problem, expressed as a DAG of obligations rather than an authored
 * array. `entry` names the obligation with no unmet prerequisite that a
 * player reaches first; `linearize()` checks this rather than assuming it.
 */
export type ObligationGraph = {
  problem: string
  title: string
  targetConcepts: ReadonlyArray<string>
  entry: ObligationId
  nodes: Readonly<Record<ObligationId, Obligation>>
  /** Read by LTY-ROUTE R3/R4, not by this module. */
  fallback: BridgeId
}

/**
 * Every obligation in an order that respects `requires`. Deterministic: ties
 * break by `ObligationId`, never insertion order, so the "requires is
 * actually read" test is meaningful.
 *
 * Depth-first postorder. `stack` is the current recursion path, not the
 * visited set: reaching a node by two paths is fine; a cycle is not.
 */
function topologicalOrder(graph: ObligationGraph): ReadonlyArray<ObligationId> {
  const order: Array<ObligationId> = []
  const settled = new Set<ObligationId>()

  function visit(id: ObligationId, stack: ReadonlySet<ObligationId>): void {
    if (settled.has(id)) return
    if (stack.has(id)) {
      throw new Error(
        `linearize: "${id}" requires itself, directly or through a cycle ` +
          `of other obligations. An obligation graph is a DAG; this one isn't.`
      )
    }
    const node = graph.nodes[id]
    if (node === undefined) {
      throw new Error(
        `linearize: "${id}" is required but is not a node in this graph.`
      )
    }
    const nextStack = new Set(stack)
    nextStack.add(id)
    for (const dep of [...node.requires].sort()) {
      visit(dep, nextStack)
    }
    settled.add(id)
    order.push(id)
  }

  for (const id of Object.keys(graph.nodes).sort()) {
    visit(id, new Set())
  }

  return order
}

/**
 * The graph, linearized into the `Exercise` the shim would serve had it been
 * authored as a flat array. Acceptance test: *it emits what the
 * hand-authored array emits* (`obligation-graph.test.ts`).
 */
export function linearize(graph: ObligationGraph): Exercise {
  // `entry` must be the only root: topologicalOrder visits every key, so a
  // second, disconnected root would silently ride along in the output.
  const roots = Object.keys(graph.nodes)
    .filter((id) => graph.nodes[id]!.requires.length === 0)
    .sort()
  if (roots.length > 1) {
    throw new Error(
      `linearize: more than one obligation has no prerequisite (${roots.join(", ")}) ` +
        `— an obligation graph has exactly one entry, not one route per root.`
    )
  }

  const order = topologicalOrder(graph)
  const first = order[0]

  if (first === undefined) {
    throw new Error("linearize: this graph has no nodes.")
  }
  if (first !== graph.entry) {
    throw new Error(
      `linearize: "${graph.entry}" is declared as the entry but "${first}" ` +
        "has no unmet prerequisite and would be reached first. The entry " +
        "must be the one obligation every route actually starts from."
    )
  }

  const steps = order.map((id) => {
    // Every id in `order` was already dereferenced by `topologicalOrder`.
    const node = graph.nodes[id]!
    // `id` last, so a stray runtime `content.id` cannot override the key.
    return { ...node.content, id }
  })

  return { id: graph.problem, title: graph.title, steps }
}
