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

/** What owes home a note's set-aside mark, and takes one back. */
export type MarkOwing = {
  /** Owes `id`'s mark, let go at `at` (ISO 8601); says whether storage kept it. */
  readonly owe: (id: string, at: string) => boolean
  /** Takes back a mark owed for a set-aside write that did not happen. */
  readonly unowe: (id: string) => void
}

let wired: MarkOwing | null = null

/** The phone's owing of marks, through whatever the lane wired in. */
export const voiceMarks: MarkOwing = {
  owe: (id, at) => wired?.owe(id, at) ?? true,
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
 * Sets note `id` aside at `at` with its mark owed: the mark first, then
 * `write` (the store's standing). Nothing is written when the mark could
 * not be kept, and the mark is taken back when the write fails. Says
 * whether the note is set aside.
 */
export function setAsideOwing(
  id: string,
  at: string,
  write: () => boolean,
  marks: MarkOwing = voiceMarks
): boolean {
  if (!marks.owe(id, at)) return false
  if (write()) return true
  marks.unowe(id)
  return false
}
