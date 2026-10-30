/**
 * Sample lines for the preview: a 49ers third-and-long, as a short's
 * voiceover might say it. The timings are made up, not measured: each word
 * lasts longer the longer it is, with a short gap between words and a pause
 * between lines, which is close enough to speech to tune a look on. Real
 * word timings come from the transcriber (README, "Word timings").
 */

import type { SpokenLine, TimedWord } from "./timing"

const SAMPLE_LINES: ReadonlyArray<string> = [
  "Third and eleven, Niners backed up at their own eighteen.",
  "Purdy steps up, buys one more second, and finds Kittle over the middle.",
  "Kittle shakes the first tackle, carries the second, and moves the chains.",
  "Two plays later it's first and goal. That's the drive that won the week.",
]

const FIRST_WORD_MS = 400
const GAP_MS = 40
const LINE_PAUSE_MS = 700

/** A word's length in time: a base plus a little per letter. */
const wordMs = (text: string): number => 140 + 38 * text.length

function timeLines(lines: ReadonlyArray<string>): ReadonlyArray<SpokenLine> {
  let at = FIRST_WORD_MS
  return lines.map((line) => {
    const words = line.split(" ").map((text): TimedWord => {
      const word = { text, startMs: at, endMs: at + wordMs(text) }
      at = word.endMs + GAP_MS
      return word
    })
    at += LINE_PAUSE_MS
    return { words }
  })
}

export const SAMPLE: ReadonlyArray<SpokenLine> = timeLines(SAMPLE_LINES)
