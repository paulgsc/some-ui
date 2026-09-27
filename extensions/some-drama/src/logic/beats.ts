// ── Beats ─────────────────────────────────────────────────────────────────────
// The pure half of the live emotional log. background.ts owns storage and
// calls logBeat(); the card calls episodeCurve() / curvePath() to draw the
// ride so far. No DOM, no browser globals (logic/ layer).
//
// Grammar:
//   beat     one reaction while watching — mood × intensity at a video time
//   episode  the beats sharing a (dramaId, episode) pair
//   curve    an episode's beats as points: x = where in the episode (0..1),
//            y = mood valence × intensity (-1..+1)

import { MOODS } from "@drama/logic/content/constants"
import type { BeatRecord, Intensity, MoodType } from "@drama/types"

/** A second press of the same mood inside this window escalates the beat. */
export const REPEAT_WINDOW_MS = 2_000

/** Oldest beats are dropped past this many (Charter §8: bounded storage). */
export const MAX_BEATS = 5_000

export type BeatInput = Omit<
  BeatRecord,
  "intensity" | "capturedAt" | "updatedAt"
> & { at: number }

export type LogResult = {
  beats: Array<BeatRecord>
  beat: BeatRecord
  escalated: boolean
}

function nextIntensity(i: Intensity): Intensity {
  return i === 1 ? 2 : 3
}

/**
 * Append a press to the log. If the most recent beat is the same mood in the
 * same episode and was last pressed within {@link REPEAT_WINDOW_MS}, that beat
 * is escalated (intensity + 1, capped at 3) rather than a new one logged — so
 * "love, love, love" in quick succession is one beat that hit hard, anchored at
 * the video time of the first press.
 */
export function logBeat(
  beats: ReadonlyArray<BeatRecord>,
  input: BeatInput
): LogResult {
  const { at, ...fields } = input
  const last = beats.at(-1)
  const escalates =
    last?.dramaId === fields.dramaId &&
    last.episode === fields.episode &&
    last.mood === fields.mood &&
    at - last.updatedAt >= 0 &&
    at - last.updatedAt <= REPEAT_WINDOW_MS

  if (escalates) {
    const beat: BeatRecord = {
      ...last,
      intensity: nextIntensity(last.intensity),
      updatedAt: at,
    }
    return { beats: [...beats.slice(0, -1), beat], beat, escalated: true }
  }

  const beat: BeatRecord = {
    ...fields,
    intensity: 1,
    capturedAt: at,
    updatedAt: at,
  }
  return {
    beats: [...beats, beat].slice(-MAX_BEATS),
    beat,
    escalated: false,
  }
}

/** Beats belonging to one episode of one drama, in log order. */
export function episodeBeats(
  beats: ReadonlyArray<BeatRecord>,
  dramaId: string,
  episode: string
): Array<BeatRecord> {
  return beats.filter((b) => b.dramaId === dramaId && b.episode === episode)
}

export function valenceOf(mood: MoodType): number {
  return MOODS.find((m) => m.type === mood)?.valence ?? 0
}

export type CurvePoint = { x: number; y: number; beat: BeatRecord }

/**
 * An episode's beats as points on the ride.
 *
 * x is the position in the episode (videoTime / duration) when every beat has
 * a video time and some beat knows the duration; otherwise beats are spaced
 * evenly in log order, so the curve still reads as a sequence.
 */
export function episodeCurve(
  beats: ReadonlyArray<BeatRecord>
): Array<CurvePoint> {
  if (beats.length === 0) return []
  const duration = Math.max(0, ...beats.map((b) => b.duration ?? 0))
  const timed = duration > 0 && beats.every((b) => b.videoTime !== null)

  const ordered = timed
    ? [...beats].sort((a, b) => (a.videoTime ?? 0) - (b.videoTime ?? 0))
    : [...beats]

  return ordered.map((beat, i) => ({
    x: timed
      ? Math.min(1, (beat.videoTime ?? 0) / duration)
      : ordered.length === 1
        ? 0.5
        : i / (ordered.length - 1),
    y: (valenceOf(beat.mood) * beat.intensity) / 3,
    beat,
  }))
}

/**
 * SVG path data for a curve in a `width` × `height` box, y = 0 at mid-height.
 * Starts on the baseline (the episode opens neutral) and ends at the latest
 * point, so the line stops where the ride currently is. No points → an empty
 * path; the dashed baseline alone is drawn.
 */
export function curvePath(
  points: ReadonlyArray<CurvePoint>,
  width: number,
  height: number
): string {
  if (points.length === 0) return ""
  const mid = height / 2
  const px = (x: number): string => (x * width).toFixed(1)
  const py = (y: number): string => (mid - y * mid).toFixed(1)
  return [
    `M0 ${mid.toFixed(1)}`,
    ...points.map((p) => `L${px(p.x)} ${py(p.y)}`),
  ].join(" ")
}

/** How long a beat's pulse lingers on the overlay before settling. */
export function decayMs(intensity: Intensity): number {
  return 2_500 + (intensity - 1) * 2_000
}

/** "Ep 12" / "Episode 12" / "12화" / "第12集" → "Ep 12"; "" when absent. */
export function parseEpisode(title: string): string {
  const m = /(?:\bep(?:isode)?\.?\s*|第\s*)(\d+)|(\d+)\s*(?:화|회|集)/i.exec(
    title
  )
  const n = m?.[1] ?? m?.[2]
  return n ? `Ep ${Number(n)}` : ""
}

/**
 * Canonical episode label, so the catalog's "Ep 03" or "3" and a page title's
 * "3화" name the same episode. Unparseable labels pass through trimmed.
 */
export function normalizeEpisode(label: string): string {
  const trimmed = label.trim()
  if (/^\d+$/.test(trimmed)) return `Ep ${Number(trimmed)}`
  return parseEpisode(trimmed) || trimmed
}

/** The episode of the drama's most recent beat, or `fallback` if it has none. */
export function latestEpisode(
  beats: ReadonlyArray<BeatRecord>,
  dramaId: string,
  fallback: string
): string {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i]
    if (b?.dramaId === dramaId) return b.episode
  }
  return fallback
}
