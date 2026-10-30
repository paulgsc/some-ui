/**
 * The plans: what the owner picks instead of single levers. Each plan is a
 * fixed bundle of vocabulary values (`vocabulary.ts`), as some-censor's modes
 * are (`extensions/some-censor/src/lib/settings/modes.ts`). A scene's own
 * override wins over its look, and its look over the video's (`resolve.ts`).
 */

import type { MusicMode, Sound, Transition } from "./vocabulary"

export const LOOKS = ["plain", "calm", "lively"] as const

export type Look = (typeof LOOKS)[number]

/** How a look moves the picture; `resolve.ts` turns it into a `Motion`. */
export type LookMotion =
  | { readonly kind: "still" }
  | { readonly kind: "push-in"; readonly amount: number }
  | { readonly kind: "punch-in-at-taps"; readonly amount: number }

export type LookRules = {
  readonly transition: Transition
  readonly motion: LookMotion
  /** The sound at each scene's start, and at each tap, or none. */
  readonly cues: {
    readonly sceneStart: Sound | null
    readonly tap: Sound | null
  }
  readonly music: MusicMode
  /**
   * How the headline and captions move under this look: the burn-ins
   * (ST15) read these; the renderer draws no text.
   */
  readonly headline: "appears" | "fades-up" | "pops"
  readonly captions: "line" | "word"
}

export const LOOK_RULES: Readonly<Record<Look, LookRules>> = {
  plain: {
    transition: "cut",
    motion: { kind: "still" },
    cues: { sceneStart: null, tap: null },
    music: "off",
    headline: "appears",
    captions: "line",
  },
  calm: {
    transition: "crossfade",
    motion: { kind: "push-in", amount: 0.06 },
    cues: { sceneStart: null, tap: null },
    music: "under-voice",
    headline: "fades-up",
    captions: "word",
  },
  lively: {
    transition: "slide-up",
    motion: { kind: "punch-in-at-taps", amount: 0.2 },
    cues: { sceneStart: "whoosh", tap: "click" },
    music: "up-between-lines",
    headline: "pops",
    captions: "word",
  },
}

export const VOICES = ["ad-lib", "read", "mixed"] as const

export type Voice = (typeof VOICES)[number]

export type VoiceRules = {
  /** What Record shows for a scene: the point to make, or the line. */
  readonly sceneShows: "point" | "line" | "either"
  /** What Claude checks a take against. */
  readonly checks: "true-and-yours" | "every-word" | "per-scene"
  /** Rounds of takes a scene may take before it goes back to the owner. */
  readonly rounds: number
  /** Where captions take their words from. */
  readonly captionsFrom: "said" | "line"
}

export const VOICE_RULES: Readonly<Record<Voice, VoiceRules>> = {
  "ad-lib": {
    sceneShows: "point",
    checks: "true-and-yours",
    rounds: 3,
    captionsFrom: "said",
  },
  read: {
    sceneShows: "line",
    checks: "every-word",
    rounds: 3,
    captionsFrom: "line",
  },
  mixed: {
    sceneShows: "either",
    checks: "per-scene",
    rounds: 3,
    captionsFrom: "said",
  },
}
