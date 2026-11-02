/**
 * Where Let go owes home its set-aside mark (MIC2 #2372, LA13): every store
 * that sets a voice note aside does it through `setAsideOwing`, which owes
 * the mark in the voice-home record before the standing is written, so a
 * note is set aside only once its mark is owed as storage keeps it. The
 * voice lane wires the record in (`lib/home-link/voice-copy`'s
 * `watchVoiceNotes`); this module reaches no store and sends nothing.
 *
 * Until the lane is wired (a build with no home lane, or the moment before
 * the app shell mounts it), nothing of this phone goes home as a voice note
 * under a mark, so owing answers yes: a note set aside then is owed on the
 * lane's first pass (`oweMarks`), as one set aside before marks were owed
 * at Let go is.
 */

/**
 * The store a set-aside note is kept in, as home is told it (`of`): what the
 * voice lane reads to tell a note gone from one it has not read yet.
 */
export type MarkFrom =
  | "reflection"
  | "jobs"
  | "scene"
  | "soundbite"
  | "lens"
  | "leetype"

/** What owes home a note's set-aside mark, and takes one back. */
export type MarkOwing = {
  /**
   * Owes `id`'s mark, let go at `at` (ISO 8601), kept in `from`; says
   * whether storage kept it.
   */
  readonly owe: (id: string, at: string, from: MarkFrom) => boolean
  /** Takes back a mark owed for a set-aside write that did not happen. */
  readonly unowe: (id: string) => void
}

let wired: MarkOwing | null = null

/** The phone's owing of marks, through whatever the lane wired in. */
export const voiceMarks: MarkOwing = {
  owe: (id, at, from) => wired?.owe(id, at, from) ?? true,
  unowe: (id): void => {
    wired?.unowe(id)
  },
}

/** The voice lane wires the record in, until the returned call. */
export function wireVoiceMarks(owing: MarkOwing): () => void {
  wired = owing
  return (): void => {
    if (wired === owing) wired = null
  }
}

/**
 * Sets note `id`, kept in `from`, aside at `at` with its mark owed: the
 * mark first, then `write` (the store's standing). Nothing is written when
 * the mark could not be kept, and the mark is taken back when the write
 * fails. A store whose notes go home in no lane yet (`from` null: Rust
 * Rounds, until RR6 #2237) owes none. Says whether the note is set aside.
 */
export function setAsideOwing(
  id: string,
  from: MarkFrom | null,
  at: string,
  write: () => boolean,
  marks: MarkOwing = voiceMarks
): boolean {
  if (from === null) return write()
  if (!marks.owe(id, at, from)) return false
  if (write()) return true
  marks.unowe(id)
  return false
}
