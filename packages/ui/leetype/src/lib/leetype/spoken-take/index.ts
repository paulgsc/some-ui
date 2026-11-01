/**
 * A spoken answer's take (canon v1.2, Def. 9.5) on the take pattern
 * (`@some-ui/voice-capture`, MIC4 #2374): tap to start and stop, then where
 * it's kept, Play, Redo and Let go. The microphone, keeping the audio and
 * what the take answered are the phone's (`apps/www`'s `lib/leetype-takes`),
 * so this is the port only. The play runtime decides which take answers the
 * record screen in view; a take and its notes go home, and to Drive with the
 * study-context export (#1934).
 */
import type {
  PatternTake,
  TakeItemView,
  TakePattern,
} from "@some-ui/voice-capture"

export type SpokenTakeSnapshot = {
  /** The takes kept, as the take pattern lists them; the same array while nothing changed. */
  readonly takes: ReadonlyArray<PatternTake>
  /** No new take can be kept until home holds some of those kept. */
  readonly full: boolean
  /** No answer can be kept at all, typed included, until home holds some. */
  readonly notesFull: boolean
}

/** What a take answered, kept with it for the weekly review (#1927). */
export type SpokenTakeNote = {
  /** The take's id, or none for a typed answer. */
  readonly take: string | null
  readonly file: string
  readonly screen: string
  readonly prompt: string
  readonly rubric: ReadonlyArray<string>
  readonly ticks: ReadonlyArray<string>
  readonly typed: string | null
}

export type SpokenTakes = {
  /** The phone's take pattern a spoken answer is taken on: one take an answer. */
  readonly pattern: TakePattern
  readonly getSnapshot: () => SpokenTakeSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** Keeps what a settled answer said, beside its take: false when it could not. */
  readonly note: (note: SpokenTakeNote) => boolean
}

/** A spoken answer's take as the record screen shows it. */
export type SpokenTakeView = {
  /** The pattern's parts for this answer: the take button, its line, its take's row. */
  readonly item: TakeItemView
  readonly full: boolean
  readonly notesFull: boolean
}

/** What a take answers: the record screen `screen` in session file `file`. */
export const answersOf = (file: string, screen: string): string =>
  `${file}#${screen}`
