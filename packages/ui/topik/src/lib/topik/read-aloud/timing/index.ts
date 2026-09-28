/**
 * Read-aloud timing: how long each step of a rep's ladder runs, and the
 * nominal practice a rep is credited with (adaptive-learning canon Def. 4.8,
 * Cor. 4.6, Def. 6.6, Rem. 4.10).
 *
 * - A sentence's turn is set by level: as long as a reader at that level
 *   needs to read its syllables aloud, at a rate fixed per level. Nothing the
 *   learner does moves it (Cor. 4.6 (ii)).
 * - A word's turn adapts through its pace factor, which is pacing and
 *   nothing more (Cor. 4.6 (iii)): it shortens a little on each rep run
 *   without a stuck report and lengthens on each report.
 * - Practice is credited at a nominal duration fixed by the item's length and
 *   the level, never measured on the clock, so neither a pause nor a pace
 *   lengthened by false reports can move it (Prop. 6.4 (iv)).
 * - Every step is capped so a whole rep, and an introduction, stays within
 *   the two minutes Remark 4.10 declares for every screen.
 */

import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"

/** Read-aloud rate per level, in syllables per second (Cor. 4.6 (ii)). */
export const LEVEL_RATE: Record<ReadAloudLevel, number> = {
  1: 1.5,
  2: 2.2,
  3: 3.0,
}

/** Glyphs alone, before the turn begins: a beat to take the item in. */
export const SETTLE_MS = 450

/** The gloss, held once the echo ends. */
export const GLOSS_MS = { word: 2200, sentence: 3000 } as const

/** An introduction's hold, after its audio: glyphs and gloss together. */
export const INTRODUCTION_HOLD_MS = 2500

/** The set summary's countdown before the next set (Rem. 4.10: it bounds itself). */
export const SUMMARY_MS = 4000

/** Caps that keep every screen within two minutes (Rem. 4.10). */
export const MAX_TURN_MS = 60_000
/** The longest the runtime waits for speech before moving on regardless. */
export const MAX_SPEECH_MS = 30_000
export const MIN_ECHO_MS = 1400
export const MAX_ECHO_MS = { word: 5500, sentence: 12_000 } as const
/** Remark 4.10's bound on any screen the renderer shows. */
export const MAX_SCREEN_MS = 120_000
/** Remark 4.10: after this much of a sitting, nothing new begins. */
export const SITTING_MS = 30 * 60_000

/** Pace factor: bounds, and how a rep moves it (Cor. 4.6 (iii)). */
export const PACE_MIN = 0.5
export const PACE_MAX = 2
export const PACE_CLEAN = 0.88
export const PACE_REPORTED = 1.4

/** A rough speaking time, for fallbacks and nominal credit. */
export const SPEECH_MS_PER_SYLLABLE = 300

const HANGUL = /[가-힣]/g

/** The number of Hangul syllables in a text: what the timings scale with. */
export const syllablesOf = (text: string): number =>
  text.match(HANGUL)?.length ?? 0

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** A word's turn: its length, scaled by its pace factor. */
export function wordTurnMs(syllables: number, factor: number): number {
  const base = 1500 + 550 * syllables
  return Math.round(
    clamp(base * clamp(factor, PACE_MIN, PACE_MAX), 0, MAX_TURN_MS)
  )
}

/** A sentence's turn: its syllables at the level's rate, and nothing else. */
export function sentenceTurnMs(
  syllables: number,
  level: ReadAloudLevel
): number {
  const ms = 900 + (syllables * 1000) / LEVEL_RATE[level]
  return Math.round(clamp(ms, 0, MAX_TURN_MS))
}

/** How long the runtime waits for speech that never reports its end. */
export const speechFallbackMs = (syllables: number): number =>
  clamp(800 + syllables * SPEECH_MS_PER_SYLLABLE * 2, 0, MAX_SPEECH_MS)

/** The echo: time to repeat what was just heard. */
export function echoMs(heardMs: number, kind: "word" | "sentence"): number {
  return Math.round(clamp(heardMs * 1.2 + 600, MIN_ECHO_MS, MAX_ECHO_MS[kind]))
}

/** A pace factor after one more rep of its word (Cor. 4.6 (iii)). */
export function nextPace(factor: number, reported: boolean): number {
  return clamp(
    factor * (reported ? PACE_REPORTED : PACE_CLEAN),
    PACE_MIN,
    PACE_MAX
  )
}

/**
 * The practice a counted rep is credited with (Def. 6.6, Prop. 6.4 (iv)):
 * its whole ladder at nominal speed, with a word's turn at pace factor one
 * and speech at its nominal rate. It depends on the item's length and the
 * level only.
 */
export function nominalRepMs(
  kind: "word" | "sentence",
  syllables: number,
  level: ReadAloudLevel
): number {
  const turn =
    kind === "word"
      ? wordTurnMs(syllables, 1)
      : sentenceTurnMs(syllables, level)
  const speech = syllables * SPEECH_MS_PER_SYLLABLE
  return SETTLE_MS + turn + speech + echoMs(speech, kind) + GLOSS_MS[kind]
}
