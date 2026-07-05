// ── Story fixtures ────────────────────────────────────────────────────────────
// Typed CardState fixtures for some-drama stories (DRM-STORY S2).
//
// Everything here is derived from the canonical `DramaEntry` type in
// `src/types`, then projected to the `CardState` the card actually renders.
// Building the full entry first means a story fixture can never drift from the
// real data shape — if `DramaEntry` changes, these stop compiling.

import type { CardSize, CardState, DramaEntry, MoodType } from "@drama/types"

let seq = 0

/**
 * A realistic, fully-populated `DramaEntry`. Pass overrides for the fields a
 * given fixture cares about; everything else stays typical.
 */
export function dramaEntry(overrides: Partial<DramaEntry> = {}): DramaEntry {
  return {
    id: `fixture-${++seq}`,
    addedAt: 0,

    // ── Structural (factual / scrapable) ──────────────────────────────────────
    title: "Queen of Tears",
    episode: "Ep 12 / 16",
    network: "tvN",
    year: "2024",
    genre: "Romance",
    note: "",
    color: "#e06c9f",
    url: "https://example.test/watch",
    posterUrl: null,
    timestamp: "27:53",
    progress: 0.63,
    isPlaying: true,

    // ── Opinionated (feeling-at-the-moment) ───────────────────────────────────
    rating: 8.6,
    completionLikelihood: 0.92,
    activeMood: "love",
    featuredQuote: "Don't look at me like that",
    emotionLabel: "heart eyes",
    overallProgress: 0.74,
    axes: { connection: 70, hope: -30, trust: -80, control: 40 },
    transition: { before: "hopeful", after: "devastated" },
    tags: ["handTouch", "reveal"],
    peakLine: "The umbrella scene in the rain",
    momentum: { value: 75, direction: "falling" },

    ...overrides,
  }
}

/** Project a `DramaEntry` onto the `CardState` the card consumes. */
export function cardStateFromEntry(entry: DramaEntry): CardState {
  return {
    dramaTitle: entry.title,
    posterUrl: entry.posterUrl,
    episode: entry.episode,
    timestamp: entry.timestamp,
    progress: entry.progress,
    overallProgress: entry.overallProgress,
    rating: entry.rating,
    completionLikelihood: entry.completionLikelihood,
    activeMood: entry.activeMood,
    featuredQuote: entry.featuredQuote,
    emotionLabel: entry.emotionLabel,
    isPlaying: entry.isPlaying,
    axes: entry.axes,
    transition: entry.transition,
    tags: entry.tags,
    peakLine: entry.peakLine,
    momentum: entry.momentum,
  }
}

/** Shorthand: build a `CardState` straight from entry overrides. */
export function cardState(overrides: Partial<DramaEntry> = {}): CardState {
  return cardStateFromEntry(dramaEntry(overrides))
}

// ── State-matrix fixtures (empty · typical · extreme) ─────────────────────────

/** Nothing captured yet — every slide in its empty/prompt shape. */
export const EMPTY_STATE: CardState = cardState({
  posterUrl: null,
  activeMood: null,
  featuredQuote: "",
  emotionLabel: "",
  peakLine: "",
  tags: [],
  transition: { before: "", after: "" },
  axes: { connection: 0, hope: 0, trust: 0, control: 0 },
  momentum: { value: 0, direction: "steady" },
  rating: 0,
})

/** The default, well-populated middle-of-the-road card. */
export const TYPICAL_STATE: CardState = cardState()

/** Everything pushed to its edge — axes at ±100, tag overflow, falling fast. */
export const EXTREME_STATE: CardState = cardState({
  axes: { connection: 100, hope: -100, trust: -100, control: 100 },
  tags: [
    "confession",
    "handTouch",
    "kiss",
    "reveal",
    "argument",
    "goodbye",
    "betrayal",
  ],
  momentum: { value: 100, direction: "falling" },
  rating: 10,
  peakLine: "Everything, all at once, in the rain",
})

// ── Axes for the matrix stories ───────────────────────────────────────────────

/** The three card sizes, in cycle order. */
export const SIZES: ReadonlyArray<CardSize> = ["min", "compact", "full"]

/** Every mood — drives `--dc-mood-hue`. */
export const MOOD_MATRIX: ReadonlyArray<MoodType> = [
  "joy",
  "love",
  "sadness",
  "tension",
  "cringe",
  "neutral",
]
