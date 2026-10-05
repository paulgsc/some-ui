import type { ConstructionStep, DiagnosticStep } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
} from "@leetype/types/exercise"

import { linearize } from "./obligation-graph"
import type { ObligationGraph } from "./obligation-graph"
import { fallbackRoute } from "./worked-route"

/**
 * Compile-time totality (LTY-ROUTE R4). The proof is structural, not path
 * enumeration: acyclicity plus a well-founded, strictly decreasing measure.
 *
 * The measure is the count of obligations remaining from the current node
 * to the end of the route, `fallbackRoute(graph, from).steps.length`. It
 * drops by one per step (`requires` gives a strict acyclic order), is
 * bounded below by 1, and the domain is finite (Axiom 1.1). So
 * `checkFallbackReachesTerminal` calls `fallbackRoute` once per node: the
 * returned value is the witness.
 *
 * The graph stores no separate advance or escape edges: `linearize()`'s
 * order is the advance edge and `fallbackRoute` the escape edge. Hence:
 *
 * - "every node has an advance and an escape edge" is `checkSingleRoot` +
 *   `checkSingleTerminal` + `checkFallbackReachesTerminal`.
 * - "every declared sink maps to an existing bridge" is
 *   `checkSinkBridgesPresent` (present and non-empty; there is no bridge
 *   registry).
 * - "no sink can lock progression" holds by construction: `fallbackRoute`
 *   reads only `requires`, never sink data. `totality.test.ts` mutates sink
 *   data and checks the route is unchanged.
 */

/**
 * The most nodes an obligation graph may have: the same ceiling as a whole
 * exercise (8 to 12 steps, `index.test.ts`), since a graph is a subset of one
 * exercise's steps.
 */
export const MAX_OBLIGATIONS_PER_ROUTE = 12

/**
 * Mirrors the engine's `MAX_STEP_ATTEMPTS` (`crates/leetype_wasm`; the third
 * failed attempt advances regardless). Not the source of truth: if the
 * engine's cap changes this must follow, and nothing will fail if it doesn't.
 */
const ASSUMED_MAX_ATTEMPTS_PER_NODE = 3

/**
 * The worst-case total step count of a route if every obligation hit the
 * attempt cap. Only reported in `checkGraphSizeWithinBound`'s message: the
 * node bound already implies it.
 */
const STATIC_ROUTE_STEP_BOUND =
  MAX_OBLIGATIONS_PER_ROUTE * ASSUMED_MAX_ATTEMPTS_PER_NODE

/** One violation, naming the node it was found on when there is one. */
type Violation = { node?: string; message: string }

function violationsToMessages(
  violations: ReadonlyArray<Violation>
): Array<string> {
  return violations.map((v) =>
    v.node === undefined ? v.message : `"${v.node}": ${v.message}`
  )
}

/** Every `requires` reference resolves to a node actually in the graph. */
function checkEdgesTargetExistingNodes(
  graph: ObligationGraph
): Array<Violation> {
  const violations: Array<Violation> = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    for (const dep of node.requires) {
      if (graph.nodes[dep] === undefined) {
        violations.push({
          node: id,
          message: `requires "${dep}", which is not a node in this graph.`,
        })
      }
    }
  }
  return violations
}

/**
 * No obligation (transitively) requires itself. A pure, non-throwing check
 * independent of `linearize()`'s own cycle guard.
 */
function checkAcyclic(graph: ObligationGraph): Array<Violation> {
  const settled = new Set<string>()
  const violations: Array<Violation> = []

  function visit(id: string, stack: ReadonlySet<string>): void {
    if (settled.has(id) || violations.length > 0) return
    if (stack.has(id)) {
      violations.push({
        node: id,
        message: "requires itself, directly or through a cycle.",
      })
      return
    }
    const node = graph.nodes[id]
    if (node === undefined) return // checkEdgesTargetExistingNodes already reports this
    const nextStack = new Set(stack)
    nextStack.add(id)
    for (const dep of node.requires) visit(dep, nextStack)
    settled.add(id)
  }

  for (const id of Object.keys(graph.nodes)) visit(id, new Set())
  return violations
}

/** Exactly one node has no prerequisite — the route's one entry point. */
function checkSingleRoot(graph: ObligationGraph): Array<Violation> {
  const roots = Object.keys(graph.nodes)
    .filter((id) => graph.nodes[id]!.requires.length === 0)
    .sort()
  if (roots.length === 0) {
    return [
      { message: "no node has an empty requires list — there is no entry." },
    ]
  }
  if (roots.length > 1) {
    return [
      {
        message: `more than one node has no prerequisite (${roots.join(", ")}) — an obligation graph has exactly one entry.`,
      },
    ]
  }
  // roots.length is exactly 1 here (0 and >1 both returned above).
  const soleRoot = roots[0]!
  if (soleRoot !== graph.entry) {
    return [
      {
        node: graph.entry,
        message: `is declared as entry, but "${soleRoot}" is the node with no prerequisite.`,
      },
    ]
  }
  return []
}

/**
 * Exactly one node is required by nothing: the route's one terminal. With
 * `checkSingleRoot`, every other node has something after it.
 */
function checkSingleTerminal(graph: ObligationGraph): Array<Violation> {
  const requiredIds = new Set<string>()
  for (const node of Object.values(graph.nodes)) {
    for (const dep of node.requires) requiredIds.add(dep)
  }
  const terminals = Object.keys(graph.nodes)
    .filter((id) => !requiredIds.has(id))
    .sort()
  if (terminals.length === 0) {
    // Only on a cyclic graph; checkAcyclic and checkSingleRoot report it.
    return []
  }
  if (terminals.length > 1) {
    return [
      {
        message: `more than one node is required by nothing (${terminals.join(", ")}) — routes through this graph would not converge on one ending.`,
      },
    ]
  }
  return []
}

/**
 * The escape edge, proven: `fallbackRoute` succeeds from every node and ends
 * at the graph's terminal.
 */
function checkFallbackReachesTerminal(
  graph: ObligationGraph
): Array<Violation> {
  let linearized
  try {
    linearized = linearize(graph)
  } catch {
    // Already reported, more clearly, by the checks above.
    return []
  }
  const terminalId = linearized.steps.at(-1)?.id
  if (terminalId === undefined) return []

  const violations: Array<Violation> = []
  for (const id of Object.keys(graph.nodes)) {
    try {
      const route = fallbackRoute(graph, id)
      const routeEndsAt = route.steps.at(-1)?.id ?? "(empty route)"
      if (routeEndsAt !== terminalId) {
        violations.push({
          node: id,
          message: `its fallback route ends at "${routeEndsAt}", not the graph's terminal "${terminalId}".`,
        })
      }
    } catch (error) {
      violations.push({
        node: id,
        message: `fallbackRoute threw: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  return violations
}

/**
 * Every value in `sinkRoutes`, and every `fallbackBridge`, is present and
 * non-empty: the only existence claim possible without a bridge registry.
 */
function checkSinkBridgesPresent(graph: ObligationGraph): Array<Violation> {
  const violations: Array<Violation> = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.fallbackBridge.trim().length === 0) {
      violations.push({ node: id, message: "fallbackBridge is empty." })
    }
    for (const [sink, bridge] of Object.entries(node.sinkRoutes)) {
      if (bridge === undefined || bridge.trim().length === 0) {
        violations.push({
          node: id,
          message: `sinkRoutes["${sink}"] has no bridge.`,
        })
      }
    }
  }
  return violations
}

/**
 * Re-validates every node's `content` against its strict family schema, as
 * the corpus lint does: a construction node has one witness plus evidence,
 * a diagnostic node has a `trace`.
 */
function checkContentSatisfiesItsFamily(
  graph: ObligationGraph
): Array<Violation> {
  const violations: Array<Violation> = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    const probed = { id: "totality-check-probe", ...node.content }
    const isDiagnostic = "rationale" in node.content
    const result = isDiagnostic
      ? DiagnosticStepSchema.safeParse(probed)
      : ConstructionStepSchema.safeParse(probed)
    if (!result.success) {
      const family: "DiagnosticStep" | "ConstructionStep" = isDiagnostic
        ? "DiagnosticStep"
        : "ConstructionStep"
      violations.push({
        node: id,
        message: `content does not satisfy ${family}Schema: ${result.error.issues[0]?.message ?? "unknown error"}`,
      })
    }
  }
  return violations
}

function typingSourceOf(
  content: Omit<ConstructionStep, "id"> | Omit<DiagnosticStep, "id">
): string | undefined {
  return content.blocks.find((block) => block.kind === "typing")?.source
}

/**
 * The typed portion of a witness source, matching the engine's context-span
 * semantics (`program.rs`) rather than `types/exercise.ts`'s `typedPortionOf`.
 * The difference is a dangling `‹`: the engine treats it as context to the
 * end (`typed_stream("let x = ‹abc")` types only `"let x ="`), while the
 * approximation counts it as typed. Harmless for a length budget, wrong for
 * this emptiness check (`‹answer` would look typeable).
 */
function typedPortionMatchingEngine(source: string): string {
  let typed = ""
  let i = 0
  while (i < source.length) {
    if (source[i] === "‹") {
      const closeIndex = source.indexOf("›", i + 1)
      if (closeIndex === -1) break // dangling opener: context to EOF
      i = closeIndex + 1
    } else {
      typed += source[i]
      i += 1
    }
  }
  return typed
}

/**
 * A witness must have something to type outside any `‹context›` span
 * (LTY-FRAME). No schema catches this: an all-context source is still a
 * non-empty string.
 */
function checkWitnessIsRevealable(graph: ObligationGraph): Array<Violation> {
  const violations: Array<Violation> = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    const source = typingSourceOf(node.content)
    if (source === undefined) continue // checkContentSatisfiesItsFamily already reports this
    const typed = typedPortionMatchingEngine(source).trim()
    if (typed.length === 0) {
      violations.push({
        node: id,
        message:
          "its witness has nothing outside a ‹context› span (or ends in an unmatched ‹ — context runs to end of source) — nothing for the learner to reveal or type.",
      })
    }
  }
  return violations
}

/** The graph's node count stays within `MAX_OBLIGATIONS_PER_ROUTE`. */
function checkGraphSizeWithinBound(graph: ObligationGraph): Array<Violation> {
  const size = Object.keys(graph.nodes).length
  if (size > MAX_OBLIGATIONS_PER_ROUTE) {
    const worstCaseSteps = size * ASSUMED_MAX_ATTEMPTS_PER_NODE
    return [
      {
        message:
          `${size} obligations exceeds the static bound of ${MAX_OBLIGATIONS_PER_ROUTE} per route ` +
          `(worst case ${worstCaseSteps} steps if every one were escaped at the attempt cap, ` +
          `over the ${STATIC_ROUTE_STEP_BOUND}-step static bound).`,
      },
    ]
  }
  return []
}

/**
 * Every check: shape (edges, cycles, one entry, one terminal), then
 * reachability, content and size. A check that depends on an earlier one
 * holding reports nothing new rather than throwing or duplicating.
 */
function allChecks(graph: ObligationGraph): Array<Violation> {
  return [
    ...checkEdgesTargetExistingNodes(graph),
    ...checkAcyclic(graph),
    ...checkSingleRoot(graph),
    ...checkSingleTerminal(graph),
    ...checkFallbackReachesTerminal(graph),
    ...checkSinkBridgesPresent(graph),
    ...checkContentSatisfiesItsFamily(graph),
    ...checkWitnessIsRevealable(graph),
    ...checkGraphSizeWithinBound(graph),
  ]
}

/** Every violation in a graph, empty when the graph is total. Pure; never throws. */
export function validateTotality(graph: ObligationGraph): Array<string> {
  return violationsToMessages(allChecks(graph))
}

/**
 * Throws, naming the offending nodes, for a caller that wants to fail loudly
 * at the seam rather than later as a route with no terminal.
 */
export function assertGraphIsTotal(graph: ObligationGraph): void {
  const violations = validateTotality(graph)
  if (violations.length > 0) {
    const listed = violations.map((v) => `  - ${v}`).join("\n")
    throw new Error(
      `Obligation graph "${graph.problem}" is not total (${violations.length} violation(s)):\n${listed}`
    )
  }
}
