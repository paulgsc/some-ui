// ─── Song Schema ─────────────────────────────────────────────────────────────

export type Song = {
  title: string
  artist: string
  videoId: string
  thumbnailUrl: string
  currentTime: number
  duration: number
  /** normalized 0–1: calm → energetic */
  arousal: number
  /** normalized 0–1: sad → happy */
  valence: number
  /** normalized 0–1: slow → fast */
  tempo: number
  /** normalized 0–1: quiet → loud */
  intensity: number
}

export type EmotionLabel =
  | "melancholic"
  | "tense"
  | "dreamy"
  | "nostalgic"
  | "uplifting"
  | "euphoric"
  | "atmospheric"

// ─── Emotion Color ────────────────────────────────────────────────────────────

const EMOTION_PALETTE = [
  { r: 139, g: 92, b: 246 }, // purple  — valence 0.00
  { r: 99, g: 102, b: 241 }, // indigo  — valence 0.25
  { r: 34, g: 211, b: 238 }, // cyan    — valence 0.50
  { r: 251, g: 146, b: 60 }, // orange  — valence 0.75
  { r: 251, g: 113, b: 133 }, // coral  — valence 1.00
] as const

export type RGB = {
  r: number
  g: number
  b: number
}

export function getEmotionColor(valence: number): RGB {
  const max = EMOTION_PALETTE.length - 1

  // clamp valence → [0, 1]
  const v = Math.min(1, Math.max(0, valence))

  const idx = v * max
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, max)
  const t = idx - lo

  const c0 = EMOTION_PALETTE[lo]
  const c1 = EMOTION_PALETTE[hi]

  if (!c0 || !c1) {
    throw new Error("EMOTION_PALETTE index out of bounds")
  }

  return {
    r: Math.round(c0.r + (c1.r - c0.r) * t),
    g: Math.round(c0.g + (c1.g - c0.g) * t),
    b: Math.round(c0.b + (c1.b - c0.b) * t),
  }
}

export function emotionRgbString(valence: number): string {
  const { r, g, b } = getEmotionColor(valence)
  return `rgb(${r}, ${g}, ${b})`
}

export function getEmotionLabel(
  valence: number,
  arousal: number
): EmotionLabel {
  if (valence < 0.3 && arousal < 0.4) return "melancholic"
  if (valence < 0.4 && arousal >= 0.4) return "tense"
  if (valence >= 0.3 && valence < 0.6 && arousal < 0.4) return "dreamy"
  if (valence >= 0.6 && arousal < 0.5) return "nostalgic"
  if (valence >= 0.6 && arousal >= 0.5 && arousal < 0.7) return "uplifting"
  if (valence >= 0.7 && arousal >= 0.7) return "euphoric"
  return "atmospheric"
}

// ─── Heuristic: infer emotion dims from YT audio element ─────────────────────
// Real impl would use Web Audio API; this gives plausible defaults
// until actual audio analysis is wired.

export function inferSongDims(
  _video: HTMLVideoElement
): Pick<Song, "arousal" | "valence" | "tempo" | "intensity"> {
  // We cannot actually read audio features without WebAudio + analyser.
  // Return mid-range defaults; caller can enrich via external API later.
  return { arousal: 0.5, valence: 0.55, tempo: 0.5, intensity: 0.6 }
}
