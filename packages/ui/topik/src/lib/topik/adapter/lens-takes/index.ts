/**
 * A take of the learner reading a grammar-lens line aloud (adaptive-learning
 * canon Rem. 4.16). Recording, keeping the audio and playing it back are the
 * phone's (www's `lib/lens-takes`, over `@some-ui/voice-capture`), so this is
 * the port only; topik renders its snapshot and forwards taps.
 */

import type { VoiceTake } from "@topik/lib/topik/adapter/voice-take"

export type LensTakeSnapshot = {
  take: VoiceTake
  /** Said once beside the button: how the last take ended, or why none can. */
  said: string | null
  /** The last take kept since the last `reset`. */
  last: { id: string; durationMs: number } | null
  /** The last take is playing back. */
  playing: boolean
  /** No new take can be kept until the takes are shared (Rem. 4.16). */
  full: boolean
}

export type LensTakes = {
  getSnapshot: () => LensTakeSnapshot
  subscribe: (listener: () => void) => () => void
  /** Starts a take of `line` (a line id), the line as authored. */
  start: (line: string) => void
  /** Ends a take under way and keeps it, and stops a playback. */
  stop: () => void
  /** Plays the last take back. */
  playLast: () => void
  /** The item is done: a take under way is kept, and the last is forgotten. */
  reset: () => void
}
