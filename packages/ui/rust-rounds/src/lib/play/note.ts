/**
 * The card's voice note as the take pattern's parts show it: a pure
 * projection of the session's state, the notes the phone keeps and
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
import { deskLine, lineOf } from "./machine"
import type { DeskDraft, Visit } from "./store"
import { WORDS } from "./words"

export type CardNote = {
  /** The pattern's parts: the button, its line, and the card's note as a row. */
  readonly item: TakeItemView
  /** What the session says beside them, in its own words; null for nothing. */
  readonly aside: string | null
}

/**
 * The note of `line` as the pattern's parts show it: its row is `note`
 * alone, and a take that couldn't play is said by the pattern; anything
 * else said is `said`, the caller's reading of the session's.
 */
function noteView(
  state: PlayState,
  line: string,
  note: string | null,
  said: TakeItemView["said"],
  takes: ReadonlyArray<PatternTake>,
  options: TakePatternOptions
): TakeItemView {
  const mine = takes.filter((take) => take.id === note)
  const view = takeItemView(state.notes, mine, line, options)
  return { ...view, said: view.said?.kind === "unplayable" ? view.said : said }
}

/**
 * The paste's voice note on the desk step (RR4c): what it says is this
 * step's, never a card's take that ended while the step was open.
 */
export function deskNote(
  state: PlayState,
  desk: DeskDraft,
  takes: ReadonlyArray<PatternTake>,
  options: TakePatternOptions
): TakeItemView {
  const line = deskLine(desk.at)
  const { said } = state
  const ours =
    said?.kind === "setAside" ||
    (said?.kind === "ended" && said.ended.answers === line)
  return noteView(state, line, desk.note, ours ? said : null, takes, options)
}

export function cardNote(
  state: PlayState,
  visit: Visit,
  takes: ReadonlyArray<PatternTake>,
  options: TakePatternOptions
): CardNote {
  const { said } = state
  return {
    item: noteView(
      state,
      lineOf(visit),
      visit.note,
      // For this visit, until the next card.
      said === null || said.kind === "missing" ? null : said,
      takes,
      options
    ),
    aside: said?.kind === "missing" ? WORDS.noteMissing : null,
  }
}
