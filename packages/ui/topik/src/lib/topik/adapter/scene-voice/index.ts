/**
 * The scene the learner wants next, said aloud: the voice notes a drama's
 * request carries to their model (docs/makjang/README.md, "Describing the
 * next scene aloud"), on the take pattern (`@some-ui/voice-capture`).
 * Recording, keeping the audio and where each note is kept are the phone's
 * (www's `lib/scene-voice`), so this is the port only; topik draws the
 * pattern's parts and forwards taps.
 *
 * The phone chooses the scene's options: up to `SCENE_NOTES_MAX` notes in
 * the draft, beside each other (`takes: { per: "many" }`), each played on
 * its own. Its one divergence beyond them is the scene-level Let go
 * (`letGoScene`): the whole draft set aside at once, as Let go sets one
 * note aside (D3).
 */

import type { PatternTake, TakePattern } from "@some-ui/voice-capture"

/** A voice note in the draft. */
export type SceneNote = { id: string; durationMs: number; mimeType: string }

export type SceneVoiceSnapshot = {
  /** The draft's notes, oldest first: what an ask names. */
  readonly notes: ReadonlyArray<SceneNote>
  /** Every note kept, as the take pattern lists them. */
  readonly takes: ReadonlyArray<PatternTake>
  /** A take is under way: an ask waits for it. */
  readonly taking: boolean
  /**
   * This phone keeps no more notes until home holds some set aside or
   * recorded again: no new take can be kept.
   */
  readonly full: boolean
}

export type SceneVoice = {
  /** The phone's take pattern, on which the draft's notes are taken. */
  readonly pattern: TakePattern
  /** What every take of the draft answers, as the pattern lists it. */
  readonly answers: string
  /** The same object while nothing changed. */
  readonly getSnapshot: () => SceneVoiceSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** D3 for the whole draft: sets every note in it aside, kept. */
  readonly letGoScene: () => void
  /**
   * Lets go from this phone each note `homeHolds` names that is out of the
   * draft, or that an ask home holds carried (LG1).
   */
  readonly letGo: (homeHolds: ReadonlySet<string>) => void
}
