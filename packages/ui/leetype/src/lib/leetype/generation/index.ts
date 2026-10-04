/**
 * What the app hands a learner to give their own model: the round prompt,
 * the proposition register it must cite from, one reviewed round as a
 * worked example, and their request.
 *
 * The same shape as TOPIK's lesson generator (`@some-ui/topik`,
 * `lib/topik/generation`): the app supplies the grammar and checks the
 * answer (`./intake`), and the learner's model does the generating. Nothing
 * here calls a model or a server. The prompt is text the learner copies,
 * and the round comes back the same way.
 *
 * The register and the example are appended at build time rather than
 * written into the markdown, so neither can drift from the canon
 * (`PROPOSITION_REGISTER`, generated from §7) or from the reviewed corpus
 * (`AUTHORED_ROUNDS`, which CI compiles and lints).
 */

import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { RoundNote } from "@leetype/lib/leetype/notes"
import { promptLinesOf } from "@leetype/lib/leetype/notes"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { serializeRound } from "@leetype/lib/leetype/round-export"

import ROUND_PROMPT from "./round-prompt.md?raw"

export { ROUND_PROMPT }

export const DEFAULT_MEMBERS = 3
export const MIN_MEMBERS = 2
/** `MAX_PRESENTABLE_DIFFS` in the corpus lint: a phone shows at most five. */
export const MAX_MEMBERS = 5

/** How many recently played rounds the prompt names: the delta, not the path. */
const RECENT_ROUNDS = 5

export type RoundRequest = {
  /** The register entry the admissible member should witness. */
  focus?: PropositionId
  /** A problem to build `A` around; the model invents one when absent. */
  premise?: string
  /** `|D|`, clamped to `[MIN_MEMBERS, MAX_MEMBERS]`. */
  members?: number
  /** Ids of rounds the learner has played recently, newest first. */
  recent?: ReadonlyArray<string>
  /**
   * The learner's margin notes, newest first (`lib/leetype/notes`, canon
   * Rem. 3.7): what they said while playing, for the model to write the
   * next round against (Rem. 3.3). Never a belief: the prompt carries them
   * to the learner's own model and nothing else reads them here.
   */
  notes?: ReadonlyArray<RoundNote>
  /**
   * `learner` (the default) is one person's next round, kept on their
   * device. `corpus` is the operator writing a round for everyone (the
   * round CRM), so no one learner's history applies.
   */
  audience?: "learner" | "corpus"
}

const clampMembers = (members: number | undefined): number =>
  Math.min(
    MAX_MEMBERS,
    Math.max(MIN_MEMBERS, Math.round(members ?? DEFAULT_MEMBERS))
  )

/** §7 as the model needs it: every active entry's id, title and statement. */
function registerSection(): string {
  const entries = Object.values(PROPOSITION_REGISTER)
    .filter((entry) => entry.status === "active")
    .map((entry) => `- **${entry.id}: ${entry.title}.** ${entry.statement}`)
  return [
    "## The register",
    "",
    "Cite only these identifiers. They are numbered and never reused.",
    "",
    ...entries,
  ].join("\n")
}

/** One reviewed round, serialized exactly as the server stores it. */
function exampleSection(): string {
  const example = AUTHORED_ROUNDS[0]
  if (example === undefined) return ""
  return [
    "## A worked example",
    "",
    "A reviewed round from the app's own corpus. Match its shape exactly; do not copy its problem.",
    "",
    "```json",
    serializeRound(example).trimEnd(),
    "```",
  ].join("\n")
}

/** The prompt, with the register, the example and this request appended; ready to copy. */
export function buildRoundPrompt(request: RoundRequest = {}): string {
  const lines = [
    `Focus: ${request.focus ?? "(choose one)"}`,
    `Premise: ${request.premise?.trim() || "(invent one)"}`,
    `Members: ${clampMembers(request.members)}`,
  ]
  const recent = (request.recent ?? []).slice(0, RECENT_ROUNDS)
  const history =
    request.audience === "corpus"
      ? "Recent rounds: none - this round joins the shared corpus every learner draws from."
      : recent.length > 0
        ? `Recent rounds (newest first): ${recent.join(", ")}`
        : "Recent rounds: none yet."
  // One learner's notes say nothing about a round written for everyone.
  const notes =
    request.audience === "corpus" ? [] : promptLinesOf(request.notes ?? [])
  const noted =
    notes.length > 0
      ? ["Learner notes (newest first):", ...notes]
      : ["Learner notes: none."]
  return [
    ROUND_PROMPT.trimEnd(),
    "",
    "---",
    "",
    registerSection(),
    "",
    "---",
    "",
    exampleSection(),
    "",
    "---",
    "",
    "## This request",
    "",
    ...lines,
    history,
    ...noted,
    "",
  ].join("\n")
}
