/**
 * Whether home could make out a take (HEARD1, paulgsc/server#908): home
 * judges every transcript when it makes it and keeps its verdict beside the
 * text (`some-ui.voice-transcript/1`, `verdict`: `{kind, reasons, rule,
 * signals}`, only `kind` read here). Every essay reads this one verdict
 * instead of guessing from the words (HEARD2, paulgsc/some-ui#3072).
 *
 * - **heard:** home made out what was said; the text is the answer. A
 *   transcript with no verdict, as every one before HEARD1, reads as heard.
 * - **silent:** home heard that nothing was said (`nothing_said`): a
 *   silence, as an item left unanswered is.
 * - **unheard:** something was said and home couldn't make it out
 *   (`garbled` or `failed`, or a kind this build doesn't know). An essay
 *   reads it as if the owner never answered, and never reads its text:
 *   garble is not a weak answer.
 */
import { isRecord } from "@some-ui/core-utils"
import { z } from "zod"

import { words } from "./format"

/** Home's verdict on a transcript, as an essay reads it. */
export type Hearing = "heard" | "silent" | "unheard"

/** The hearing a transcript's body carries in its `verdict`. */
export function hearingOf(transcript: unknown): Hearing {
  const verdict = isRecord(transcript) ? transcript["verdict"] : undefined
  if (verdict === undefined || verdict === null) return "heard"
  const kind = isRecord(verdict) ? verdict["kind"] : undefined
  return kind === "heard"
    ? "heard"
    : kind === "nothing_said"
      ? "silent"
      : "unheard"
}

/**
 * What an essay says over an answer home couldn't make out, in place of a
 * guess at why it was left: code's words, never a routine's (C430).
 */
export const UNHEARD_SAID =
  "Something was said for this one, but the recording couldn't be made out, so the essay goes on as if it was left unanswered."

/** A silence in an essay: a guess at why it was left, or a take home couldn't make out. */
export type Silence = {
  readonly kind: "silence"
  readonly guess?: string
  readonly unheard?: true
}

/** The fields of every essay's silence; refine with `isSilenceShape`. */
export const SILENCE_FIELDS = {
  kind: z.literal("silence"),
  /** The guess at why, said over the silence. */
  guess: words.optional(),
  /** A take was sent and home couldn't make it out: `UNHEARD_SAID` is said over it. */
  unheard: z.literal(true).optional(),
}

/** Why a silence isn't one: it carries a guess or is unheard, never both or neither. */
export const SILENCE_SHAPE =
  "a silence carries a guess at why, or says the take couldn't be made out, and not both"

/** Whether a silence is one of the two shapes `SILENCE_SHAPE` names. */
export const isSilenceShape = (silence: Omit<Silence, "kind">): boolean =>
  (silence.unheard === true) !== (silence.guess !== undefined)

/** Whether an essay's answer is a take home couldn't make out. */
export const isUnheard = (answer: { readonly kind: string }): boolean =>
  answer.kind === "silence" && "unheard" in answer && answer.unheard === true

/** What is said over a silence: its guess, or `UNHEARD_SAID`. */
export const silenceSaid = (silence: Silence): string =>
  silence.unheard === true ? UNHEARD_SAID : (silence.guess ?? "")
