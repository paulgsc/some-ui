// ── Constants ─────────────────────────────────────────────────────────────────
// Static data: mood configs, fallback quotes, timings, size order.
// Pure data — no DOM, no state, no side effects.

import type { CardSize, MoodType } from "@drama/types"

export type MoodConfig = {
  type: MoodType
  emoji: string
  label: string
  // The card's theme while this is the mood (DramaCard sets them as
  // --dc-hue / --dc-hue-2 / --dc-sat). Hues run past 0 and 360 on purpose:
  // the theme hue is animated as a plain number, so neighbours on the colour
  // wheel are kept numerically close and a change sweeps the short way round.
  hue: number
  accent: number // second hue: the surface tint and gradients' warm end
  sat: number // saturation multiplier; 1 is the default card
  // Where a beat of this mood sits on the episode curve, before intensity
  // scales it: +1 is the top of the ride, -1 the bottom.
  valence: number
}

export const MOODS: ReadonlyArray<MoodConfig> = [
  {
    type: "joy",
    emoji: "😊",
    label: "Joy",
    hue: 42,
    accent: 18,
    sat: 1.1,
    valence: 0.8,
  },
  {
    type: "love",
    emoji: "🥰",
    label: "Love",
    hue: -25,
    accent: 5,
    sat: 1.05,
    valence: 1,
  },
  {
    type: "sadness",
    emoji: "😭",
    label: "Sad",
    hue: 215,
    accent: 240,
    sat: 0.55,
    valence: -1,
  },
  {
    type: "tension",
    emoji: "😬",
    label: "Tension",
    hue: 2,
    accent: 28,
    sat: 1.15,
    valence: -0.6,
  },
  {
    type: "cringe",
    emoji: "🫣",
    label: "Cringe",
    hue: -75,
    accent: 95,
    sat: 0.8,
    valence: -0.4,
  },
  {
    type: "neutral",
    emoji: "😐",
    label: "Meh",
    hue: 200,
    accent: 180,
    sat: 0.2,
    valence: 0,
  },
] as const

/** The theme before any mood is known: the original rose-and-peach card. */
export const DEFAULT_THEME: Pick<MoodConfig, "hue" | "accent" | "sat"> = {
  hue: -20,
  accent: 18,
  sat: 1,
}

export const FALLBACK_QUOTES: ReadonlyArray<string> = [
  "I'll find you wherever you go",
  "Don't look at me like that",
  "This isn't what I wanted...",
  "You knew all along, didn't you?",
  "Just this once. Stay.",
] as const

// Slideshow auto-advance interval
export const SLIDE_INTERVAL_MS = 5_000

// Cycling order for the size toggle button
export const SIZE_CYCLE: ReadonlyArray<CardSize> = [
  "compact",
  "full",
  "min",
] as const
