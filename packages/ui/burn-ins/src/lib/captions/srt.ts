/**
 * The plain subtitle file that goes up beside each short (SubRip, `.srt`),
 * for YouTube's search and for anyone who turns captions on. One entry per
 * caption, its lines as drawn, its words as said (no theme's capitals).
 */

import type { Caption } from "./timing"

const pad = (n: number, width: number): string => String(n).padStart(width, "0")

/** `HH:MM:SS,mmm`, as SubRip writes a time. */
export function srtTime(ms: number): string {
  const whole = Math.max(0, Math.round(ms))
  const h = Math.floor(whole / 3_600_000)
  const m = Math.floor(whole / 60_000) % 60
  const s = Math.floor(whole / 1000) % 60
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(whole % 1000, 3)}`
}

export function toSrt(captions: ReadonlyArray<Caption>): string {
  return captions
    .map((c, i) =>
      [
        String(i + 1),
        `${srtTime(c.startMs)} --> ${srtTime(c.endMs)}`,
        ...c.rows.map((row) => row.map((w) => w.text).join(" ")),
      ].join("\n")
    )
    .map((entry) => `${entry}\n`)
    .join("\n")
}
