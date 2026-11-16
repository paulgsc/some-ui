/**
 * Whether home could make out a take (HEARD1, paulgsc/server#908): home
 * judges every transcript when it makes it and keeps its verdict beside the
 * text (`some-ui.voice-transcript/1`, `verdict`). Every essay reads this one
 * verdict instead of guessing from the words (HEARD2, paulgsc/some-ui#3072).
 *
 * - **heard:** home made out what was said; the text is the answer.
 * - **silent:** home heard that nothing was said (`nothing_said`): the
 *   take reads as a silence, as a ticket left unanswered does.
 * - **unheard:** something was said and home couldn't make it out
 *   (`garbled` or `failed`, or a verdict this build doesn't know). An essay
 *   reads it as if the owner never answered, and never reads the text as an
 *   answer: garble is not a weak answer.
 * - **unjudged:** the transcript carries no verdict (`null`), as every one
 *   home made before HEARD1 does. It reads as it always has, as heard.
 *
 * The verdict is `{"kind","reasons","rule","signals"}`, top-level beside
 * `text`; only `kind` is read here.
 */
import { isRecord } from "@some-ui/core-utils"

/** Home's verdict on a transcript, as an essay reads it. */
export type Hearing = "heard" | "silent" | "unheard" | "unjudged"

/** Each verdict kind home gives that isn't "couldn't make it out". */
const KINDS: Readonly<Record<string, Hearing>> = {
  heard: "heard",
  nothing_said: "silent",
}

/** The hearing a transcript's body carries in its `verdict`. */
export function hearingOf(transcript: unknown): Hearing {
  if (!isRecord(transcript)) return "unjudged"
  const verdict = transcript["verdict"]
  if (verdict === undefined || verdict === null) return "unjudged"
  const kind = isRecord(verdict) ? verdict["kind"] : undefined
  return typeof kind === "string" && Object.hasOwn(KINDS, kind)
    ? (KINDS[kind] ?? "unheard")
    : "unheard"
}

/**
 * What an essay says over an answer home couldn't make out, in place of a
 * guess at why it was left: code's words, never a routine's (C430).
 */
export const UNHEARD_SAID =
  "Something was said for this one, but the recording couldn't be made out, so the essay goes on as if it was left unanswered."

/** A silence in an essay: a guess at why it was left, or a take home couldn't make out. */
type Silence = { readonly guess?: string; readonly unheard?: true }

/** What is said over a silence: its guess, or `UNHEARD_SAID`. */
export const silenceSaid = (silence: Silence): string =>
  silence.unheard === true ? UNHEARD_SAID : (silence.guess ?? "")

/** Why a silence isn't one: it carries a guess or is unheard, never both or neither. */
export const SILENCE_SHAPE =
  "a silence carries a guess at why, or says the take couldn't be made out, and not both"

/** Whether a silence is one of the two shapes `SILENCE_SHAPE` names. */
export const isSilenceShape = (silence: Silence): boolean =>
  (silence.unheard === true) !== (silence.guess !== undefined)
