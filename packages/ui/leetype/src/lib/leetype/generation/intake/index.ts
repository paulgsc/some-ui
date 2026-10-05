/**
 * Taking a round back from the learner's model.
 *
 * The learner pastes whatever their model replied: a fenced JSON block, bare
 * JSON, prose around it. This finds the round in it and holds it to the same
 * checks CI holds the reviewed corpus to (`lintAuthoredRounds`), in the
 * browser: every hunk applies to `A`, `A` fits the budget before the
 * constraint diff and not after, and every authored admissibility claim
 * agrees with the cost graphs. Nothing is sent anywhere.
 *
 * One check does not run here: compiling `A` and every `A + d` with `rustc`
 * (`scripts/check-round-programs-compile.ts`). A browser has no Rust
 * toolchain. That is acceptable for what a learner round is used for: its
 * programs are read, never executed, because execution runs only corpus
 * rounds, by id, on the server (`paulgsc/server#381`). A round the operator
 * publishes through the round CRM takes the same intake; the compile check
 * reaches it once the server's runner exists.
 */

import type { Monomial } from "@leetype/lib/leetype/cost"
import { multiplyMonomials, ONE } from "@leetype/lib/leetype/cost"
import type { AssembledRound } from "@leetype/lib/leetype/round-assembly"
import {
  assembleRound,
  lintAuthoredRounds,
} from "@leetype/lib/leetype/round-assembly"
import type { Round } from "@leetype/types/authored-round"
import { RoundSchema } from "@leetype/types/authored-round"

export type RoundIntake =
  | { ok: true; round: Round; assembled: AssembledRound }
  | {
      ok: false
      /** One line per failed check, for the learner and for `fixRequest`. */
      violations: Array<string>
    }

const FENCE = "```"
const LANGUAGE = "json"

/** Spaces, tabs and a CR are allowed between a fence's opening and its newline. */
const isInlineSpace = (char: string | undefined): boolean =>
  char === " " || char === "\t" || char === "\r"

/**
 * The body of every ``` or ```json fence in `text`, in order. A linear scan
 * rather than a regular expression, for the reason TOPIK's intake gives
 * (`@some-ui/topik`, `lib/topik/generation/intake`): the obvious pattern
 * backtracks polynomially on whatever was pasted (CodeQL).
 */
export function fencedBodies(text: string): Array<string> {
  const bodies: Array<string> = []
  let from = 0
  for (;;) {
    const open = text.indexOf(FENCE, from)
    if (open === -1) return bodies
    let at = open + FENCE.length
    if (text.startsWith(LANGUAGE, at)) at += LANGUAGE.length
    while (isInlineSpace(text[at])) at += 1
    if (text[at] !== "\n") {
      from = open + 1
      continue
    }
    const close = text.indexOf(FENCE, at + 1)
    if (close === -1) return bodies
    bodies.push(text.slice(at + 1, close))
    from = close + FENCE.length
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function jsonValues(text: string): Array<unknown> {
  const fenced = fencedBodies(text)
  const candidates = fenced.length > 0 ? fenced : [text]
  return candidates.flatMap((candidate) => {
    try {
      const value: unknown = JSON.parse(candidate)
      return [value]
    } catch {
      return []
    }
  })
}

/**
 * A repetition as `lib/leetype/cost` normalizes it. The prompt asks for
 * normalized factors, but their order is the kind of detail a model gets
 * wrong while meaning the same monomial, and `RoundSchema` rejects any
 * order but one. Normalizing only reorders and merges factors of the same
 * product, so the cost graph is unchanged. Anything that is not a
 * well-formed factor list is left alone for the schema to report.
 */
type Factor = Monomial[number]

const isFactor = (value: unknown): value is Factor =>
  isRecord(value) &&
  (value.kind === "pow" || value.kind === "log") &&
  typeof value.dimension === "string" &&
  typeof value.exponent === "number"

function normalizedRepetition(repetition: unknown): unknown {
  if (!Array.isArray(repetition)) return repetition
  const factors: Array<unknown> = repetition
  return factors.every(isFactor) ? multiplyMonomials(factors, ONE) : repetition
}

function normalizedGraph(graph: unknown): unknown {
  if (!isRecord(graph)) return graph
  if (graph.kind === "seq" && Array.isArray(graph.children)) {
    return { ...graph, children: graph.children.map(normalizedGraph) }
  }
  if (graph.kind === "loop") {
    return {
      ...graph,
      repetition: normalizedRepetition(graph.repetition),
      body: normalizedGraph(graph.body),
    }
  }
  return graph
}

function normalizedRound(candidate: Record<string, unknown>): unknown {
  const diffOptions = Array.isArray(candidate.diffOptions)
    ? candidate.diffOptions.map((option: unknown) =>
        isRecord(option)
          ? { ...option, graph: normalizedGraph(option.graph) }
          : option
      )
    : candidate.diffOptions
  return { ...candidate, graph: normalizedGraph(candidate.graph), diffOptions }
}

/**
 * Reads a pasted reply. Never throws. The first JSON object in the reply
 * that has `diffOptions` is the round; a reply with none is refused with a
 * violation saying so.
 */
export function intakeRound(reply: string): RoundIntake {
  const candidate = jsonValues(reply).find(
    (value): value is Record<string, unknown> =>
      isRecord(value) && "diffOptions" in value
  )
  if (candidate === undefined) {
    return {
      ok: false,
      violations: [
        "No round found: the reply needs one ```json block holding the round object.",
      ],
    }
  }

  const normalized = normalizedRound(candidate)
  const violations = lintAuthoredRounds([normalized])
  if (violations.length > 0) return { ok: false, violations }

  // `lintAuthoredRounds` parsed it with the same schema and found nothing,
  // so this parse succeeds; it is repeated only to get the typed value.
  const round = RoundSchema.parse(normalized)
  try {
    return { ok: true, round, assembled: assembleRound(round) }
  } catch (error) {
    return {
      ok: false,
      violations: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/** The text a learner sends back to their model when a round is refused. */
export function fixRequest(violations: ReadonlyArray<string>): string {
  return [
    "The app checked your round and refused it. Fix exactly these problems,",
    "keep everything else the same, and reply with the whole corrected round",
    "in one ```json block:",
    "",
    ...violations.map((violation) => `- ${violation}`),
    "",
  ].join("\n")
}
