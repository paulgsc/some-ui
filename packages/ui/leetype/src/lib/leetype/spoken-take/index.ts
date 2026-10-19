/**
 * A spoken answer's take (canon v1.2, Def. 9.5): the microphone, keeping the
 * audio and what the take answered are the phone's (`apps/www`'s
 * `lib/leetype-takes`), so this is the port only. The play runtime starts
 * and stops it, and moves on when a take lands; a take and its notes go to
 * Drive with the study-context export (#1934), never home.
 */

export type SpokenTakeSnapshot = {
  readonly recording: boolean
  /** Said once beside the button: how the last take ended, or why none can. */
  readonly said: string | null
  /** The take kept since the last `reset`. */
  readonly last: { readonly id: string; readonly durationMs: number } | null
  /** No new take can be kept until the takes are shared. */
  readonly full: boolean
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
  readonly getSnapshot: () => SpokenTakeSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** Starts a take of the answer to `screen` in `file`. */
  readonly start: (about: { file: string; screen: string }) => void
  /** Ends a take under way and keeps it. */
  readonly stop: () => void
  /** A new prompt: the last take is forgotten, a take under way still kept. */
  readonly reset: () => void
  /** Keeps what a settled answer said, beside its take. */
  readonly note: (note: SpokenTakeNote) => void
}
