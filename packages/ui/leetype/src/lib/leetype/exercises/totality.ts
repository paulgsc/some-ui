import type { ConstructionStep, DiagnosticStep } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
} from "@leetype/types/exercise"

import { linearize } from "./obligation-graph"
import type { ObligationGraph } from "./obligation-graph"
import { fallbackRoute } from "./worked-route"

/**
 * Compile-time totality (LTY-ROUTE R4) — "the one that is easy to get
 * wrong," per the issue's own warning, because the tempting proof is to
 * enumerate paths and the correct one is structural: acyclicity plus a
 * well-founded, strictly-decreasing measure.
 *
 * # The measure, stated plainly
 *
 * For a graph that passes every check below, the measure is *the count
 * of not-yet-linearized obligations remaining from the current node to
 * the end of the route*. `fallbackRoute(graph, from).steps.length` is
 * exactly that count. It strictly decreases by one at every step (the
 * suffix from a node's successor is always one shorter than the suffix
 * from the node itself — `worked-route.test.ts`'s "recovers dependency
 * order" fixtures already establish `requires` gives a strict, acyclic
 * order), it is bounded below by 1 (the terminal's own suffix), and the
 * domain is finite (Axiom 1.1). A measure with those three properties is
 * a proof of termination by construction — no path needs to be walked to
 * know this, which is why `checkFallbackReachesTerminal` below calls
 * `fallbackRoute` once per node rather than simulating a multi-attempt
 * playthrough: the *value* it returns each time is the witness, not the
 * act of walking it.
 *
 * # What each acceptance-list item below actually checks, honestly
 *
 * A few items in R4's issue presuppose graph features this workspace's
 * `Obligation`/`ObligationGraph` (R2, R3) does not model as separate
 * stored edges — there is no independent "advance edge" or "escape edge"
 * field, because `linearize()`'s topological order already *is* the
 * advance edge (implicitly: whatever comes next) and `fallbackRoute`
 * already *is* the escape edge (computed, not stored). Redefining the
 * graph shape to store two more edge kinds that would always agree with
 * what `requires` already implies would be state with no consumer of its
 * own — exactly what `Challenge.dependsOn`'s deletion (`types/exercise.ts`)
 * already argued against once. So:
 *
 * - *"every node has an advance edge and an escape edge"* is checked as
 *   `checkSingleRoot` + `checkSingleTerminal`: together they prove every
 *   node but the terminal is required by something (an advance edge
 *   exists) and every node's fallback reaches the terminal
 *   (`checkFallbackReachesTerminal`, an escape edge exists).
 * - *"every declared sink maps to an existing bridge"* is checked as
 *   `checkSinkBridgesPresent`: this workspace has no bridge registry to
 *   check membership against yet (that is further-out work than this
 *   epic), so "existing" is checked as "present and non-empty" — the
 *   only claim about a bridge's existence this graph shape can make.
 * - *"no sink can lock progression"* is not a runtime check here — it is
 *   true by construction, because `fallbackRoute` (`worked-route.ts`)
 *   reads only `requires`. It never reads `sinkRoutes` or the value of
 *   `fallbackBridge`, so no sink data, however malformed, can be *read*
 *   by the one function that decides whether progression continues.
 *   `totality.test.ts` proves this empirically: mutating a graph's sink
 *   data arbitrarily and confirming the route is byte-identical.
 */

/**
 * The longest an obligation graph's node count may be. Matches
 * `index.test.ts`'s own established ceiling for a *whole* exercise
 * ("carries one full curriculum, not a token two steps" — 8 to 12 steps)
 * rather than a number picked in the abstract: an obligation graph is a
 * subset of one exercise's steps (the construction/diagnostic-bearing
 * portion, excluding plain setup steps), so it can never legitimately
 * need to exceed what a whole exercise is already bounded to.
 */
export const MAX_OBLIGATIONS_PER_ROUTE = 12

/**
 * Mirrors the engine's real `MAX_STEP_ATTEMPTS` (`crates/leetype_wasm`,
 * documented in `docs/leetype/README.md`'s "gate's miss is a repeat"
 * note: the third failed attempt advances regardless). Not redefined
 * authoritatively here — this epic's lane is `packages/ui/leetype` only,
 * no crate change — so this is a mirror for computing a static bound in
 * TypeScript, not the source of truth. If the engine's cap ever changes,
 * this must change with it; there is no binding that would fail loudly
 * if it didn't, which is the honest cost of not having a crate dependency
 * in this epic. Not exported: nothing outside `checkGraphSizeWithinBound`
 * below needs it by name, only the total it contributes to.
 */
const ASSUMED_MAX_ATTEMPTS_PER_NODE = 3

/**
 * The static bound R4's issue asks for, in the units its "Done when"
 * bullet actually uses: the worst-case total step count across a whole
 * route if every single obligation were escaped at the attempt cap
 * before advancing — `MAX_OBLIGATIONS_PER_ROUTE` nodes, each consuming up
 * to `ASSUMED_MAX_ATTEMPTS_PER_NODE` attempts before the engine's own cap
 * forces an advance. Reported in `checkGraphSizeWithinBound`'s violation
 * message rather than checked independently: for a fixed
 * `ASSUMED_MAX_ATTEMPTS_PER_NODE`, a graph within `MAX_OBLIGATIONS_PER_ROUTE`
 * nodes is definitionally within this bound too, so a second check
 * against the same underlying quantity would only restate the first in
 * different units, not test anything new.
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
 * No obligation (transitively) requires itself. Independent of
 * `linearize()`'s own cycle guard on purpose — a pure, non-throwing check
 * this module can run and report on without catching an exception from a
 * different module, and the thing `totality.test.ts` asserts "the
 * validator itself rejects a cyclic bridge" against.
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
 * Exactly one node is required by nothing — the route's one terminal.
 * Together with `checkSingleRoot`, this is what "every node has an
 * advance edge" means here: every node but this one is a prerequisite of
 * something, so something comes after it.
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
    // Only reachable on a cyclic graph with no root either; checkAcyclic
    // and checkSingleRoot already report the underlying cause.
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
 * The escape edge, proven rather than assumed: `fallbackRoute` succeeds
 * from every node and always ends at the graph's terminal — "the fallback
 * route requires no inference to enter" made concrete, since it is
 * unconditionally available from anywhere `linearize()` itself succeeds.
 */
function checkFallbackReachesTerminal(
  graph: ObligationGraph
): Array<Violation> {
  let linearized
  try {
    linearized = linearize(graph)
  } catch {
    // linearize()'s own errors (cycle, multi-root, dangling edge) are
    // already reported by the checks above with a clearer, graph-specific
    // message; nothing new to add by re-throwing or re-deriving one here.
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
 * non-empty. This workspace has no bridge registry to check membership
 * against (see this module's own doc comment on why) — this is the only
 * claim about a bridge's *existence* the current graph shape can make.
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
 * Re-validates every node's `content` against the real family schemas
 * `types/exercise.ts` ships — same posture as the corpus lint
 * (LTY-FAMILIES A5): a generic parse already ran once, this re-checks the
 * strict, family-specific shape one level up. Discharges three list items
 * at once: a construction node has exactly one witness and at least one
 * other evidence block (`ConstructionStepSchema`'s own refinements), and
 * a diagnostic node has a concrete observation (`DiagnosticStepSchema`
 * requires a `trace` block).
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
 * A witness must have something to actually type: source outside any
 * `‹context›` span (LTY-FRAME), the same measure `typedPortionOf` in
 * `types/exercise.ts` uses for the diagnostic repair budget. A witness
 * entirely wrapped in context has nothing revealable in it — structurally
 * the frame with no obligation inside it — which no existing schema
 * catches, because a fully-context-wrapped source is still a non-empty
 * string.
 */
function checkWitnessIsRevealable(graph: ObligationGraph): Array<Violation> {
  const violations: Array<Violation> = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    const source = typingSourceOf(node.content)
    if (source === undefined) continue // checkContentSatisfiesItsFamily already reports this
    const typed = source.replace(/‹[^›]*›/g, "").trim()
    if (typed.length === 0) {
      violations.push({
        node: id,
        message:
          "its witness has nothing outside a ‹context› span — nothing for the learner to reveal or type.",
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
 * Every check, in the order a reader would want the story told: shape
 * first (edges, cycles, one entry, one terminal), then reachability
 * (fallback), then content, then size. Later checks that depend on an
 * earlier one holding (`checkFallbackReachesTerminal` needs `linearize`
 * to succeed) degrade to reporting nothing new rather than throwing or
 * duplicating what an earlier check already said — the same posture
 * `regionsFitTypingSource` takes in `types/exercise.ts` when a step has
 * already failed a different refinement.
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

/**
 * Every violation in a graph, empty when the graph is total. The
 * `lintCorpus`-shaped half of this module (LTY-FAMILIES A5's reusable
 * architecture, ported one level up): pure, returns rather than throws,
 * safe to call from a test per malformed fixture.
 */
export function validateTotality(graph: ObligationGraph): Array<string> {
  return violationsToMessages(allChecks(graph))
}

/**
 * The `ExerciseCorpusSchema.parse`-shaped half: throws, naming the
 * offending node, for a caller that wants to validate a graph the way
 * the shim validates its corpus at module load — loudly, at the seam,
 * rather than three components later as a route with no terminal.
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
