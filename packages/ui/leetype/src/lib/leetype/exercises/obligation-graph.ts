import type {
  ConstructionStep,
  DiagnosticStep,
  Exercise,
} from "@leetype/types/exercise"

/**
 * The obligation graph — one arrow to the left of the shim.
 *
 * ```text
 * obligation graph → linearized route → Exercise
 * ```
 *
 * `docs/leetype/README.md`'s quarantine diagram ends "→ steps"; everything
 * left of that arrow is still deferred out of M20. This module does not
 * pull any of it forward. It adds the one thing the diagram's last arrow
 * cannot express on its own: that a step's position is a *consequence* of
 * what it requires, not an array index a person picked by hand. `requires`
 * is exactly the edge `types/exercise.ts` refused to ship on `Exercise`
 * itself — "order is the linearization, and an edge nothing branches on is
 * a claim without a consumer" — answered here, upstream, where linearize()
 * is the consumer.
 *
 * # What this is not
 *
 * Not sink inference, not a routing policy, not a UI. `sinkRoutes` and
 * `fallbackBridge` exist on `Obligation` because LTY-ROUTE R3/R4 need
 * somewhere to attach a bridge to a node — this module does not read
 * either field, does not validate a bridge, and does not decide when one
 * fires. Emitting `ObligationId`, `SinkId` and `BridgeId` values is this
 * module's whole contribution to that later work; consuming them is not.
 *
 * # The seam
 *
 * Nothing here is exported from `./index.ts`, and nothing in `./index.ts`
 * imports this file. `nextExercise` still returns a plain `Exercise`, and a
 * graph's `ObligationId`/`SinkId`/`BridgeId` values never reach it: this
 * module is exercised only by its own tests, not wired into the seed
 * corpus. Wiring it in — replacing a hand-authored `Exercise` literal with
 * `linearize()`'s output — is a decision for whoever authors the next
 * problem, made on its own merits, not a consequence of this file existing.
 */

// Not exported: nothing outside this module names these types yet. LTY-ROUTE
// R3/R4/R5 will need to when they gain their own consumers of `sinkRoutes`,
// `fallbackBridge` and `fallback` — export them then, not ahead of a reason
// to.
type ObligationId = string
type SinkId = string
type BridgeId = string

/**
 * What kind of decision an obligation's witness commits the learner to.
 * Closed, per the epic's own list — a claim outside these seven is a
 * change to this union argued on its own merits, not a reason to reach
 * for the nearest existing one.
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
 * One node in the graph: everything `linearize()` needs to emit this
 * obligation as a step, plus the edges LTY-ROUTE reads and this module
 * does not.
 *
 * `content` is a `ConstructionStep` or a `DiagnosticStep`, minus `id`,
 * because the id is the node's own key in `ObligationGraph.nodes` — an
 * obligation graph has exactly one place that says what a node is called,
 * not two that have to agree. Both families are admitted (not just
 * construction) because R4's totality validator has to be able to state
 * "every diagnostic node has a concrete observation" about *some* node in
 * a graph, and a graph that can only ever contain construction content
 * has no such node to check.
 */
export type Obligation = {
  claim: ObligationClaim
  /**
   * The obligations this one assumes are already discharged. The edge
   * `Challenge.dependsOn` used to be and `ConstructionStep` refused to
   * reintroduce, because until this module existed nothing read it.
   * `linearize()` reads it.
   */
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
 * Every obligation in `graph.nodes`, in an order that respects `requires`:
 * a node never precedes anything it requires. Deterministic — ties are
 * broken by `ObligationId` alone, never by object insertion order, which
 * is what makes the "requires is actually read" test below meaningful
 * rather than accidental.
 *
 * A depth-first postorder over the dependency edges, the standard shape
 * for topologically sorting a DAG. The `stack` argument is the
 * in-progress recursion path, not the whole visited set — a node
 * reachable by two different paths is only an error if one of those paths
 * runs back through itself.
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
 * The obligation graph, linearized into the `Exercise` the shim would have
 * handed out if this problem had been authored as a flat array all along.
 *
 * The acceptance test for this function is the same one `./index.ts` sets
 * for the eventual pipeline, one level up: *it emits what the hand-authored
 * array emits.* See `obligation-graph.test.ts`.
 */
export function linearize(graph: ObligationGraph): Exercise {
  // A node with no `requires` is a root — a route that could start there
  // without inference. `entry` claims to be *the* route every player
  // starts from, which only holds if it is the graph's only root: a second
  // root would be a disconnected obligation that topologicalOrder still
  // visits (it iterates every key, not just what's reachable from `entry`)
  // and would ride along in the output whenever it happened to sort after
  // `entry`, silently, with no requires edge tying it to anything.
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
    // `topologicalOrder` already dereferenced every id in `order` via
    // `graph.nodes`, so this lookup cannot fail — the non-null assertion
    // states that rather than re-deriving it with an unreachable throw.
    const node = graph.nodes[id]!
    // `id` spread last: `content`'s declared type omits `id`, but nothing
    // at runtime enforces that against untrusted or malformed input, and
    // `{ id, ...node.content }` would let a stray `content.id` silently
    // override the node's real key — corrupting the emitted step's
    // identity without corrupting the graph. The node's own key in
    // `graph.nodes` is authoritative; nothing in `content` may override it.
    return { ...node.content, id }
  })

  return { id: graph.problem, title: graph.title, steps }
}
