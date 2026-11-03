/**
 * The turn's words (`./turn`): one pure table, in the person's terms
 * (CLAUDE.md, "State in the person's terms"). It says what was heard, what
 * is kept where and what a tap does, never the machinery: no state name, no
 * "listener", no "confirm". A screen adds its prime's words around it (its
 * question, its card), never its own copy of a line said here.
 */
import { RECORDING_FAILURE_COPY } from "./recorder"
import type { TurnNotice } from "./turn"

export const TURN_WORDS = {
  talk: "Say it",
  gettingReady: "Getting ready…",
  listening: "Listening…",
  stop: "Done talking",
  finishing: "Finishing…",
  /** The take is kept, and home is hearing it. */
  hearing: "Home is hearing it…",
  hearingLine:
    "What you said is kept. Your words come back from home in a minute or two.",
  meant: "That's right",
  fix: "Fix the words",
  again: "Say it again",
  type: "Type instead",
  typeHint: "Type it the way you'd say it.",
  keepWords: "Keep these words",
  notice: {
    notHeard: "Didn't hear anything. Try again, or type it.",
    listenFailed: "Couldn't hear that. Try again, or type it.",
    listenNotStarted: "Listening isn't working right now. Type it instead.",
    notKept: "Couldn't keep that on this phone. Your words are still here.",
    keptOnHome:
      "Home has what you said but hasn't heard it yet. Type the words for now.",
    keptOnPhone:
      "What you said is kept on this phone and goes home later. Type the words for now.",
    homeNoWords:
      "Home has what you said but can't give the words back yet. Type the words for now.",
    awayOnHome:
      "Home can't be reached right now. It has what you said. Type the words for now.",
    awayOnPhone:
      "Home can't be reached right now. What you said is kept on this phone and goes home later. Type the words for now.",
    takeFull:
      "There's no room on this phone for another take until home has the ones before it. Type it instead.",
    takeNotKept: "Couldn't keep that take. Try again, or type it.",
  } satisfies Record<Extract<TurnNotice, string>, string>,
} as const

/** A turn's notice, in its words; empty for none. */
export function turnNoticeSaid(notice: TurnNotice): string {
  if (notice === null) return ""
  return typeof notice === "string"
    ? TURN_WORDS.notice[notice]
    : RECORDING_FAILURE_COPY[notice.refused]
}
