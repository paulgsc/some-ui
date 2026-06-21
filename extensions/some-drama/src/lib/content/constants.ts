// ── Constants ─────────────────────────────────────────────────────────────────
// Static data: mood configs, fallback quotes, timings, size order.
// Pure data — no DOM, no state, no side effects.

import type { CardSize, MoodType } from "@drama/types"

export type MoodConfig = {
  type: MoodType
  emoji: string
  label: string
  hue: number // CSS hue for --dc-mood-hue
}

export const MOODS: ReadonlyArray<MoodConfig> = [
  { type: "joy", emoji: "😊", label: "Joy", hue: 40 },
  { type: "love", emoji: "🥰", label: "Love", hue: 340 },
  { type: "sadness", emoji: "😭", label: "Sad", hue: 220 },
  { type: "tension", emoji: "😬", label: "Tension", hue: 25 },
  { type: "cringe", emoji: "🫣", label: "Cringe", hue: 280 },
  { type: "neutral", emoji: "😐", label: "Meh", hue: 200 },
] as const

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
