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
 * `route(U)`: the fallback for unclassified blockage (LTY-ROUTE R3).
 *
 * ```text
 * reveal the frame, reveal the first witness, let the learner type it,
 * show the consequence, repeat for the remaining witnesses, short
 * composition replay, advance
 * ```
 *
 * Not new content: it is `linearize()`'s output read from where the learner
 * got stuck, ending at what the author already put last (for
 * `rust-hashmap-entry`, a composition step). The ordinary route, entered
 * late.
 *
 * It must work with *zero* sink taxonomy, since that is what lets the
 * taxonomy stay incomplete (R1's Thm. 6.3: `route(bot)` needs no member of
 * `Sigma` to match). `fallbackRoute` reads only `requires`.
 *
 * No second reveal mechanism or assistance currency: the engine's attempt
 * cap and shortening reveal delay make these steps arrive assisted. A step
 * reached this way is not tagged or rendered differently.
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
 * An `Obligation.content` is valid when it has no `id` of its own (the node
 * key is its identity) and, with a probe id attached, satisfies
 * `ConstructionStepSchema` or `DiagnosticStepSchema`. A stray `id` is
 * rejected explicitly: `{ id: probe, ...value }` would let it override the
 * probe and validate anyway.
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
 * Runtime validation for `Obligation`: every node must declare a
 * `fallbackBridge`. The `z.ZodType<Obligation>` annotation makes `tsc` fail
 * if this drifts from the hand-written type.
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

/** A stable bridge id for "no sink-specific bridge yet". Nothing branches on it. */
export const WORKED_ROUTE_BRIDGE = "worked-route"

/**
 * `route(U)`, computed: the obligations from `from` (inclusive) to the
 * terminal, as a slice of `linearize()`'s output, so any graph `linearize()`
 * accepts works here too.
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
