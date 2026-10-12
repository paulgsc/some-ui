/**
 * The scene the learner wants next, said aloud: the voice notes a drama's
 * request carries to their model (docs/makjang/README.md, "Describing the
 * next scene aloud"). Recording is the phone's (www's `lib/scene-voice`, over
 * `@some-ui/voice-capture`), so this is the port only; topik renders its
 * snapshot and forwards taps.
 *
 * The notes are one draft, kept on the device until they reach the
 * learner's drive or are let go: a new scene starts from the open draft,
 * never beside it.
 */

/** A voice note in the draft. */
export type SceneNote = { id: string; durationMs: number }

export type SceneVoiceSnapshot = {
  /** The draft's notes, oldest first. */
  notes: ReadonlyArray<SceneNote>
  take:
    | { kind: "idle" }
    | { kind: "opening" }
    | { kind: "recording"; elapsedMs: number }
    | { kind: "keeping" }
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
