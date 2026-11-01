/**
 * The card's voice note as the take pattern's parts show it (MIC4, #2374):
 * a pure projection of the session's state, the notes the phone keeps and
 * the pattern's options onto `takeItemView`. Only the card's own note is its
 * row (a card's kept note is the card's note), and what the card says is the
 * session's, until the next card: how this visit's last take ended, or that
 * its note was set aside.
 */
import type {
  PatternTake,
  TakeItemView,
  TakePatternOptions,
} from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"

import type { PlayState } from "./machine"
import { lineOf } from "./machine"
import type { Visit } from "./store"
import { WORDS } from "./words"

export type CardNote = {
  /** The pattern's parts: the button, its line, and the card's note as a row. */
  readonly item: TakeItemView
  /** What the session says beside them, in its own words; null for nothing. */
  readonly aside: string | null
}

export function cardNote(
  state: PlayState,
  visit: Visit,
  takes: ReadonlyArray<PatternTake>,
  options: TakePatternOptions
): CardNote {
  const line = lineOf(visit)
  const mine = takes.filter((take) => take.id === visit.note)
  const view = takeItemView(state.notes, mine, line, options)
  const { said } = state
  return {
    item: {
      ...view,
      // A take that couldn't play is said by the pattern; the rest by the
      // session, for this visit.
      said:
        view.said?.kind === "unplayable"
          ? view.said
          : said === null || said.kind === "missing"
            ? null
            : said,
    },
    aside: said?.kind === "missing" ? WORDS.noteMissing : null,
  }
}
