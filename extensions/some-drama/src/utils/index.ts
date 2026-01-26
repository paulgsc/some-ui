// Content Script Utilities - Only imported by content.ts
import type { EmotionConfig, EmotionType } from "@/types/schema"

export const EMOTIONS: Array<EmotionConfig> = [
  { type: "joy", emoji: "😊", label: "Joy", className: "emotion-joy" },
  { type: "sadness", emoji: "😭", label: "Sad", className: "emotion-sadness" },
  { type: "love", emoji: "😍", label: "Love", className: "emotion-love" },
  { type: "fear", emoji: "😱", label: "Fear", className: "emotion-fear" },
  { type: "anger", emoji: "😠", label: "Anger", className: "emotion-anger" },
  { type: "neutral", emoji: "😐", label: "Meh", className: "emotion-neutral" },
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

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (textContent) el.textContent = textContent
  return el
}
