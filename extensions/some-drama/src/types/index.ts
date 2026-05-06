// ── Types ─────────────────────────────────────────────────────────────────────
// Single source of truth for all shared types.
// No logic, no side effects — import freely from any module.

export type MoodType =
  | "joy"
  | "love"
  | "sadness"
  | "tension"
  | "cringe"
  | "neutral"

export type CardSize = "min" | "compact" | "full"

export type CardState = {
  dramaTitle: string
  posterUrl: string | null // null → placeholder emoji
  episode: string // e.g. "Ep 12 / 24"
  timestamp: string // e.g. "27:43"
  progress: number // 0–1  (position within current episode)
  overallProgress: number // 0–1  (episodes watched / total)
  rating: number // 0–10
  completionLikelihood: number // 0–1  (heuristic: will they finish?)
  activeMood: MoodType | null
  featuredQuote: string // shown in chat bubble
  emotionLabel: string // e.g. "bittersweet", "tense"
  isPlaying: boolean
}

export type CardEvents = {
  onMoodSelect: (mood: MoodType) => void
  onSizeChange: (size: CardSize) => void
  onDragEnd: (x: number, y: number) => void
}
