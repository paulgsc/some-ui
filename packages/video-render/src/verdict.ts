/**
 * Whether home could make out a take (HEARD1, paulgsc/server#908): home
 * judges every transcript when it makes it and keeps its verdict beside the
 * text (`some-ui.voice-transcript/1`, `verdict`). Every essay reads this one
 * verdict instead of guessing from the words (HEARD2, paulgsc/some-ui#3072).
 *
 * - **heard:** home made out what was said; the text is the answer.
 * - **unheard:** something was said and home couldn't make it out (garbled,
 *   nothing made out, the transcriber failed, or any verdict this build
 *   doesn't know). An essay reads it as if the owner never answered, and
 *   never reads the text as an answer: garble is not a weak answer.
 * - **unjudged:** the transcript carries no verdict, as every one home made
 *   before HEARD1 does. It reads as it always has, as heard.
 */
import { isRecord } from "@some-ui/core-utils"

/** Home's verdict on a transcript, as an essay reads it. */
export type Hearing = "heard" | "unheard" | "unjudged"

/** The verdict that means home made out what was said. */
const HEARD = "heard"

/**
 * The hearing a transcript's body carries. `verdict` is read as a word
 * (`"heard"`) or as an object naming it (`{"kind":"heard",…}`); anything
 * else present there is a verdict that home couldn't make the take out.
 */
export function hearingOf(transcript: unknown): Hearing {
  if (!isRecord(transcript)) return "unjudged"
  const verdict = transcript["verdict"]
  if (verdict === undefined || verdict === null) return "unjudged"
  const kind = isRecord(verdict) ? verdict["kind"] : verdict
  return kind === HEARD ? "heard" : "unheard"
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
