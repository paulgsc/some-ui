import type {
  ConstructionStep,
  DiagnosticStep,
  Exercise,
} from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
} from "@leetype/types/exercise"
import { z } from "zod"

import { linearize } from "./obligation-graph"
import type { Obligation, ObligationGraph } from "./obligation-graph"

/**
 * `route(U)` — the fallback for unclassified blockage (LTY-ROUTE R3).
 *
 * ```text
 * reveal the frame, reveal the first witness, let the learner type it,
 * show the consequence, repeat for the remaining witnesses, short
 * composition replay, advance
 * ```
 *
 * That sequence is not new content this module authors. It is what
 * `linearize()` already produces, read from wherever the learner got
 * stuck instead of from the start: each remaining `Obligation`'s witness,
 * in dependency order, ending at whatever the graph's own author already
 * put last — which, for a chain shaped like `rust-hashmap-entry`'s, is
 * already a composition step (`entry-06-compose`) before the transfer and
 * generalization obligations that follow it. The graph does not need a
 * second, parallel "worked" version of itself; it needs the ordinary one,
 * entered late.
 *
 * # Why this is the load-bearing story of the epic
 *
 * `route(U)` has to be correct with *zero* sink taxonomy, because it is
 * what makes the taxonomy allowed to stay incomplete (R1's Thm. 6.3 —
 * `route(bot)` must not require any member of `Sigma` to have matched).
 * `fallbackRoute` below reads nothing but the graph's own `requires`
 * edges — no `sinkRoutes`, no `fallbackBridge` value, no classification —
 * which is what makes it available before R5 ever routes on a real
 * signal.
 *
 * # What this deliberately does not add
 *
 * No second reveal mechanism, no second assistance currency, no dialog.
 * The engine already ships the escape outcome, the attempt cap, and a
 * reveal delay that shortens on retry — see `docs/leetype/README.md`'s
 * "gate's miss is a repeat" note. Nothing here needs to know any of that
 * happened: `fallbackRoute` hands back plain `Step`s, identical in shape
 * to `linearize()`'s, and the engine's existing per-attempt reveal state
 * is what makes them arrive already assisted. A step reached this way is
 * not tagged, flagged, or rendered differently — reaching it is not a
 * fact this module records anywhere the learner-facing shape can see.
 */

/** The set of `ObligationClaim` values, re-listed here only because zod
 * needs the literals at runtime; `obligation-graph.ts` owns the meaning. */
const OBLIGATION_CLAIMS = [
  "representation",
  "invariant",
  "transition",
  "progress",
  "termination",
  "complexity",
  "transfer",
] as const

/**
 * An `Obligation.content` is valid exactly when it carries no `id` of its
 * own — the node's key in `ObligationGraph.nodes` is the only place an
 * obligation's identity may come from (`linearize()`'s own comment on
 * this) — and attaching a probe id to it satisfies either
 * `ConstructionStepSchema` or `DiagnosticStepSchema`, the real schemas
 * `types/exercise.ts` already ships, reused rather than re-specified so
 * the two can never silently drift apart.
 *
 * Rejecting a stray `id` here, rather than letting the probe below
 * silently absorb it, is deliberate: `{ id: probe, ...value }` would let
 * `value.id` override the probe (object spread keeps the *last* value for
 * a repeated key), so a malformed `content` with its own `id` would still
 * validate — and would then corrupt `linearize()`'s output identity later,
 * invisibly. Failing validation here is what makes that authoring mistake
 * visible where it was made.
 */
function isValidObligationContent(
  value: unknown
): value is Omit<ConstructionStep, "id"> | Omit<DiagnosticStep, "id"> {
  if (typeof value !== "object" || value === null) return false
  if ("id" in value) return false
  const probed = { id: "obligation-content-schema-probe", ...value }
  return (
    ConstructionStepSchema.safeParse(probed).success ||
    DiagnosticStepSchema.safeParse(probed).success
  )
}

const ObligationContentSchema = z.custom<
  Omit<ConstructionStep, "id"> | Omit<DiagnosticStep, "id">
>(isValidObligationContent, {
  message:
    "An obligation's content must satisfy ConstructionStepSchema or DiagnosticStepSchema once an id is attached.",
})

/**
 * Runtime validation for `Obligation` — the acceptance criterion this
 * module exists to satisfy: *"every obligation node declares a
 * fallbackBridge, and the schema rejects one that does not."* The `:
 * z.ZodType<Obligation>` annotation is a compile-time cross-check that
 * this schema's inferred shape actually matches the hand-written type in
 * `obligation-graph.ts` — if the two drift, `tsc` fails here rather than
 * a malformed graph passing validation silently.
 */
export const ObligationSchema: z.ZodType<Obligation> = z.object({
  claim: z.enum(OBLIGATION_CLAIMS),
  requires: z.array(z.string().min(1)),
  sinkRoutes: z.record(z.string().min(1), z.string().min(1)),
  fallbackBridge: z.string().min(1),
  content: ObligationContentSchema,
})

export const ObligationGraphSchema: z.ZodType<ObligationGraph> = z.object({
  problem: z.string().min(1),
  title: z.string().min(1),
  targetConcepts: z.array(z.string().min(1)),
  entry: z.string().min(1),
  nodes: z.record(z.string().min(1), ObligationSchema),
  fallback: z.string().min(1),
})

/**
 * The fallback bridge id used by fixtures and tests in this directory.
 * Not a distinguished value this module branches on — `fallbackRoute`
 * below never reads `fallbackBridge`, only `requires` — just a stable
 * name so authored graphs don't each invent their own string for "no
 * sink-specific bridge applies here yet."
 */
export const WORKED_ROUTE_BRIDGE = "worked-route"

/**
 * `route(U)`, computed: the remaining obligations from `from` (inclusive)
 * through the graph's terminal node, in the same dependency order
 * `linearize()` already establishes.
 *
 * Deliberately built as a slice of `linearize()`'s own output rather than
 * a second traversal: the whole claim of this story is that the worked
 * route is not separate content, it is the ordinary route entered late.
 * Any obligation graph valid enough for `linearize()` to run is valid
 * enough for this to run — there is no separate well-formedness condition
 * to check.
 */
export function fallbackRoute(graph: ObligationGraph, from: string): Exercise {
  const full = linearize(graph)
  const startIndex = full.steps.findIndex((step) => step.id === from)
  if (startIndex === -1) {
    throw new Error(
      `fallbackRoute: "${from}" is not a node in this graph's linearized order.`
    )
  }
  return {
    id: full.id,
    title: full.title,
    steps: full.steps.slice(startIndex),
  }
}
