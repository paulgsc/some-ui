// Drama Sentiment CRM - Data Schema
// Pure TypeScript types and utilities - duplicated in content.ts and background.ts to avoid shared chunks

export type CapturedMoment = {
  id: string
  timestamp: number // seconds into episode
  emotion: EmotionType
  intensity: number // 0-1
  emoji: string
  note?: string
  episodeId: string
  dramaTitle: string // Runtime collected
  capturedAt: number // unix timestamp
}

export type EmotionType =
  | "joy"
  | "sadness"
  | "love"
  | "fear"
  | "anger"
  | "neutral"

export type EmotionConfig = {
  type: EmotionType
  emoji: string
  label: string
  gradient: string
  glowColor: string
}

export const EMOTIONS: Array<EmotionConfig> = [
  {
    type: "joy",
    emoji: "😊",
    label: "Joy",
    gradient: "from-pink-400 to-orange-300",
    glowColor: "shadow-pink-400/50",
  },
  {
    type: "sadness",
    emoji: "😭",
    label: "Sad",
    gradient: "from-blue-400 to-slate-400",
    glowColor: "shadow-blue-400/50",
  },
  {
    type: "love",
    emoji: "😍",
    label: "Love",
    gradient: "from-rose-400 to-pink-500",
    glowColor: "shadow-rose-400/50",
  },
  {
    type: "fear",
    emoji: "😱",
    label: "Fear",
    gradient: "from-purple-500 to-violet-600",
    glowColor: "shadow-purple-500/50",
  },
  {
    type: "anger",
    emoji: "😠",
    label: "Anger",
    gradient: "from-red-500 to-orange-600",
    glowColor: "shadow-red-500/50",
  },
  {
    type: "neutral",
    emoji: "😐",
    label: "Meh",
    gradient: "from-gray-300 to-gray-400",
    glowColor: "shadow-gray-400/50",
  },
]

export function getEmotionConfig(type: EmotionType): EmotionConfig {
  return EMOTIONS.find((e) => e.type === type) || EMOTIONS[5]
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Runtime context - collected from page
export type DramaContext = {
  dramaTitle: string
  episode: number
  timestamp: number
}
