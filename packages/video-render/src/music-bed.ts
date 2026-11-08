/**
 * The music bed we make ourselves (#2673): a quiet loop under the voice,
 * synthesised here from nothing but arithmetic, so it holds no sample, no
 * model's output and no one else's recording. The file it writes is never
 * committed: the owner lays it in `${STORAGE}/brand/` on home, where a
 * series that names it pins `MUSIC_BED.sha256` (`CheckedFileSchema`) and
 * the renderer checks it before it plays it (`render.ts`).
 *
 * It is drawn by `synth.ts`, so it comes out as the same bytes on every
 * machine: every pitch is a ratio of whole numbers (just intonation), never
 * a twelfth root of two, and the melody's choices come from fixed dice.
 *
 * What it plays: `PROGRESSION` at 72 beats a minute, two bars a chord; a
 * soft pad of each chord, a bass on its root, and a sparse music-box line
 * of the chord's own notes two octaves up. Every note's tail past the end
 * wraps to the start, and the gentle low-pass runs the loop twice, so the
 * last sample leads into the first with no seam: the renderer loops it
 * (`planBed`, `-stream_loop`) and lowers it under each take.
 *
 * A new bed is a new version: change anything here and `MUSIC_BED`'s sum,
 * its file name and the series that pins it move together. The owner may
 * pin a file of their own instead, as a new series version.
 */

import type { Partials } from "./synth"
import { addTone, dice, pcm16, pluck, SAMPLE_RATE, swell, wavOf } from "./synth"

export const MUSIC_BED = {
  /** The name it has in `${STORAGE}/brand/` on home. */
  file: "music-bed-v1.wav",
  /** `sha256sum` of the bytes `musicBedWav()` gives. */
  sha256: "f815f02a429d5efb5db39e03a175f17ae1d09b3ddea1c935555d06687b9bd89f",
} as const

const BEAT = (SAMPLE_RATE * 60) / 72
const BAR = BEAT * 4
const CHORD_BARS = 2
/** 53⅓ s. */
const LENGTH = BAR * CHORD_BARS * 8

/** D3, a little under concert pitch, so every pitch is a whole ratio of it. */
const TONIC = 147

type Chord = {
  /** Its notes as ratios of the tonic, voiced close around it. */
  readonly notes: ReadonlyArray<number>
  /** Its root an octave or so below, for the bass. */
  readonly root: number
}

const I: Chord = { notes: [1, 5 / 4, 3 / 2], root: 1 / 2 } // D
const vi: Chord = { notes: [5 / 6, 1, 5 / 4], root: 5 / 12 } // B minor
const IV: Chord = { notes: [1, 4 / 3, 5 / 3], root: 2 / 3 } // G
const V: Chord = { notes: [9 / 8, 3 / 2, 15 / 8], root: 3 / 4 } // A, back to I

/** D major's, eight chords. */
const PROGRESSION: ReadonlyArray<Chord> = [I, vi, IV, I, I, vi, IV, V]

/** The pad's colour: a soft fundamental with two quiet overtones. */
const PAD: Partials = [
  [1, 1],
  [2, 0.3],
  [3, 0.08],
]
/** The same, a hair sharp, so the two beat slowly against each other. */
const PAD_DETUNED: Partials = PAD.map(([r, l]) => [(r * 251) / 250, l * 0.8])
const BASS: Partials = [
  [1, 1],
  [2, 0.15],
]
const BELL: Partials = [
  [1, 1],
  [3, 0.12],
]

/** The loop's samples, before the low-pass and the level. */
function voices(): Float64Array {
  const out = new Float64Array(LENGTH)
  const span = BAR * CHORD_BARS
  const fade = SAMPLE_RATE * 1.6
  const roll = dice(2673)
  for (const [n, chord] of PROGRESSION.entries()) {
    const start = n * span
    for (const note of chord.notes) {
      const hz = TONIC * note
      const gain = swell(0.05, fade, span, fade)
      addTone(out, start, span + fade, hz, PAD, gain)
      addTone(out, start, span + fade, hz, PAD_DETUNED, gain)
    }
    addTone(
      out,
      start,
      span + fade,
      TONIC * chord.root,
      BASS,
      swell(0.11, SAMPLE_RATE * 0.4, span, fade)
    )
    // A note on about one beat in three, never two beats running.
    let rested = true
    for (let beat = 0; beat < span / BEAT; beat++) {
      const play: boolean = rested && roll() < 0.45
      const pick = Math.floor(roll() * chord.notes.length)
      rested = !play
      if (!play) continue
      const hz = TONIC * 4 * (chord.notes[pick] ?? 1)
      addTone(
        out,
        start + beat * BEAT,
        SAMPLE_RATE * 4,
        hz,
        BELL,
        pluck(0.07, 0.99996)
      )
    }
  }
  return out
}

/** A gentle one-pole low-pass, about 2.5 kHz, run round the loop twice. */
function soften(x: Float64Array): Float64Array {
  const a = 0.28
  let y = 0
  for (const v of x) y += a * (v - y)
  const out = new Float64Array(x.length)
  for (const [i, v] of x.entries()) {
    y += a * (v - y)
    out[i] = y
  }
  return out
}

/** The bed as a WAV file's bytes, its peak at half of full scale (-6 dBFS). */
export const musicBedWav = (): Uint8Array => wavOf(pcm16(soften(voices()), 0.5))
