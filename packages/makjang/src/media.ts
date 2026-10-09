/**
 * Media: how a renderer presents what the engine names (docs/makjang/README.md,
 * "3. Media: renditions over ports").
 *
 * Each way of presenting a beat beyond its text is a port. The ports a
 * renderer has are its capability set (canon Def. 9.3), and every port falls
 * back to text: a renderer without one presents the beat as text and changes
 * nothing else, so a missing voice is a quieter lesson, never a broken one.
 * Ports are plain functions over this package's own types; adapting a
 * platform (a speech engine, later an image or video store) to one is the
 * renderer's. The engine (`engine.ts`) imports none of this (MK1): it names
 * what to present, and a runtime calls the ports.
 *
 * A new kind of port is a new rendition kind, and lands with a canon line
 * saying what it reveals (MK7). The voice is Cor. 4.4's audio rung; the
 * sound is the feeling anchor's tone and cry (Rem. 9.2).
 */

import type { CharacterId } from "@makjang/schema"

/** How one request to a port ended. A port never throws. */
export type Presented = "presented" | "unavailable" | "cancelled"

export type VoiceRequest = {
  /** The beat being voiced, by id. */
  beat: string
  /** The beat's text, in the language being learned. */
  text: string
  /** Who says it; `null` for narration. */
  speaker: CharacterId | null
  /**
   * `true` for the learner's own replay, which cuts in on whatever is
   * playing; `false` for a beat the lesson reached, which waits its turn.
   */
  interrupt: boolean
  /** The beat started sounding. */
  onStart?: () => void
}

export type VoicePort = {
  /** Resolves once the beat has been said, could not be, or `signal` fired. */
  voice(request: VoiceRequest, signal: AbortSignal): Promise<Presented>
  /** Whether a beat could be heard now: false while muted, or voiceless. */
  audible(): boolean
  /** Calls `listener` when `audible` may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

export type StingRequest = {
  /** The scene entered, by id. */
  scene: string
  /** Its feeling, by key. */
  feeling: string
}

/**
 * A scene's feeling as sound (docs/makjang/README.md, "Where the anchor
 * goes"): played on the scene's cover, only once the learner has turned
 * sound on, and never over a line.
 */
export type SoundPort = {
  /**
   * Plays the feeling's tone, then its cry. Resolves once both have ended,
   * could not play, or `signal` fired.
   */
  sting(request: StingRequest, signal: AbortSignal): Promise<Presented>
  /** Whether a sting would play now: false until the learner turns sound on. */
  audible(): boolean
  /** Calls `listener` when `audible` may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/** Every port a renderer may have; `null` where it presents text instead. */
export type MediaPorts = {
  voice: VoicePort | null
  /** `null` falls back to the cover's caption, unheard. */
  sound: SoundPort | null
}
