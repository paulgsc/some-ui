/**
 * The scene the learner wants next, said aloud: the voice notes a drama's
 * request carries to their model (docs/makjang/README.md, "Describing the
 * next scene aloud"). Recording is the phone's (www's `lib/scene-voice`, over
 * `@some-ui/voice-capture`), so this is the port only; topik renders its
 * snapshot and forwards taps.
 */

import type { VoiceTake } from "@topik/lib/topik/adapter/voice-take"

/** A voice note in the draft. */
export type SceneNote = { id: string; durationMs: number; mimeType: string }

export type SceneVoiceSnapshot = {
  /** The draft's notes, oldest first. */
  notes: ReadonlyArray<SceneNote>
  take: VoiceTake
  /** Said once beside the button: how the last take ended, or why none can. */
  said: string | null
  /** No more notes fit the draft: a new take cannot start. */
  full: boolean
}

export type SceneVoice = {
  getSnapshot: () => SceneVoiceSnapshot
  subscribe: (listener: () => void) => () => void
  start: () => void
  /** Ends the take and keeps it. */
  stop: () => void
  /** The flow was left: a take under way is kept. */
  leave: () => void
  /** Lets these notes go, with their audio: shared, or discarded. */
  remove: (ids: ReadonlyArray<string>) => void
}
