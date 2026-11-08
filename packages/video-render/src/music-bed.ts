/**
 * The music bed we make ourselves (#2673): a quiet loop under the voice,
 * synthesised here from nothing but arithmetic, so it holds no sample, no
 * model's output and no one else's recording. The file it writes is never
 * committed: the owner lays it in `${STORAGE}/brand/` on home, and a series
 * pins it by `MUSIC_BED.sha256` (`CheckedFileSchema`), which the renderer
 * checks before it plays it (`render.ts`).
 *
 * The same bytes on every machine, not only on one: every sample comes from
 * `+`, `-`, `*`, `/` and `Math.floor`, which IEEE 754 rounds exactly the
 * same everywhere. Never the engine's sine, exponential or power, whose
 * last bit an engine may choose: the sine is a fixed polynomial (`sin2pi`),
 * a decay is a fixed factor per sample, and every pitch is a ratio of whole
 * numbers (just intonation), never a twelfth root of two. The melody's
 * choices come from an integer generator with a fixed seed. Its test holds
 * the source to that.
 *
 * What it plays: eight chords of two bars each at 72 beats a minute, D
 * major's I, vi, IV, I, I, vi, IV, V, with V leading back to the start; a
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

/** The bed's file, its sum, and what it is. */
export const MUSIC_BED = {
  version: 1,
  /** The name it has in `${STORAGE}/brand/` on home. */
  file: "music-bed-v1.wav",
  /** `sha256sum` of the bytes `musicBedWav()` gives. */
  sha256: "f815f02a429d5efb5db39e03a175f17ae1d09b3ddea1c935555d06687b9bd89f",
} as const

const RATE = 48_000
const BEAT = (RATE * 60) / 72
const BAR = BEAT * 4
const CHORD_BARS = 2
/** The loop: eight chords, 53⅓ s. */
const LENGTH = BAR * CHORD_BARS * 8

/** D3, a little under concert pitch, so every pitch is a whole ratio of it. */
const TONIC = 147

/**
 * The progression, each chord's notes as ratios of the tonic, voiced close
 * around it, and its root an octave or so below for the bass.
 */
const CHORDS: ReadonlyArray<{
  readonly notes: ReadonlyArray<number>
  readonly root: number
}> = [
  { notes: [1, 5 / 4, 3 / 2], root: 1 / 2 }, // I, D
  { notes: [5 / 6, 1, 5 / 4], root: 5 / 12 }, // vi, B minor
  { notes: [1, 4 / 3, 5 / 3], root: 2 / 3 }, // IV, G
  { notes: [1, 5 / 4, 3 / 2], root: 1 / 2 }, // I
  { notes: [1, 5 / 4, 3 / 2], root: 1 / 2 }, // I
  { notes: [5 / 6, 1, 5 / 4], root: 5 / 12 }, // vi
  { notes: [1, 4 / 3, 5 / 3], root: 2 / 3 }, // IV
  { notes: [9 / 8, 3 / 2, 15 / 8], root: 3 / 4 }, // V, A
]

const TWO_PI = 6.283185307179586

/**
 * sin(2πp) for a phase `p` in [0, 1), from its Taylor series to the 11th
 * power on [-π/2, π/2], where it is within 6e-8: far below what 16 bits hold.
 */
export function sin2pi(p: number): number {
  let x = p < 0.5 ? p : p - 1
  if (x > 0.25) x = 0.5 - x
  else if (x < -0.25) x = -0.5 - x
  const t = TWO_PI * x
  const t2 = t * t
  return (
    t *
    (1 -
      (t2 / 6) *
        (1 - (t2 / 20) * (1 - (t2 / 42) * (1 - (t2 / 72) * (1 - t2 / 110)))))
  )
}

/** A rise from 0 to 1 over `u` in [0, 1] with no corner at either end. */
const ease = (u: number): number => {
  const s = sin2pi(u / 4)
  return s * s
}

/**
 * One sine voice with its partials, added into the loop from `start` for
 * `length` samples, wrapping past the end. `gain(i)` is its level `i`
 * samples in.
 */
function addTone(
  out: Float64Array,
  start: number,
  length: number,
  hz: number,
  partials: ReadonlyArray<readonly [ratio: number, level: number]>,
  gain: (i: number) => number
): void {
  const steps = partials.map(([ratio]) => (hz * ratio) / RATE)
  const phases = partials.map(() => 0)
  for (let i = 0; i < length; i++) {
    let v = 0
    for (let k = 0; k < partials.length; k++) {
      v += (partials[k]?.[1] ?? 0) * sin2pi(phases[k] ?? 0)
      const next = (phases[k] ?? 0) + (steps[k] ?? 0)
      phases[k] = next - Math.floor(next)
    }
    const at = (start + i) % LENGTH
    out[at] = (out[at] ?? 0) + v * gain(i)
  }
}

/** Fades in over `rise`, holds, and fades out over `fall` from `hold`. */
const swell =
  (level: number, rise: number, hold: number, fall: number) =>
  (i: number): number =>
    level *
    (i < rise ? ease(i / rise) : 1) *
    (i < hold ? 1 : 1 - ease(Math.min(1, (i - hold) / fall)))

/** A pluck: a 5 ms rise, then a decay by a fixed factor each sample. */
function pluck(level: number, factor: number): (i: number) => number {
  const rise = RATE * 0.005
  let decay = 1
  return (i) => {
    if (i < rise) return (level * i) / rise
    decay *= factor
    return level * decay
  }
}

/** The pad's colour: a soft fundamental with two quiet overtones. */
const PAD: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 0.3],
  [3, 0.08],
]
/** The same, a hair sharp, so the two beat slowly against each other. */
const PAD_DETUNED: ReadonlyArray<readonly [number, number]> = PAD.map(
  ([r, l]) => [(r * 251) / 250, l * 0.8]
)
const BASS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 0.15],
]
const BELL: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [3, 0.12],
]

/** A fixed integer sequence (Numerical Recipes' LCG): the melody's dice. */
function dice(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** The loop as samples in [-1, 1], before the low-pass. */
function voices(): Float64Array {
  const out = new Float64Array(LENGTH)
  const span = BAR * CHORD_BARS
  const fade = RATE * 1.6
  const roll = dice(2673)
  for (const [n, chord] of CHORDS.entries()) {
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
      swell(0.11, RATE * 0.4, span, fade)
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
        RATE * 4,
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

/** The loop as 16-bit samples, its peak at half of full scale (-6 dBFS). */
export function musicBedSamples(): Int16Array {
  const x = soften(voices())
  let peak = 0
  for (const v of x) peak = Math.max(peak, v < 0 ? -v : v)
  const scale = peak > 0 ? 0.5 / peak : 0
  const out = new Int16Array(x.length)
  for (const [i, v] of x.entries()) out[i] = Math.round(v * scale * 32767)
  return out
}

/** The bed as a mono 48 kHz 16-bit WAV file's bytes. */
export function musicBedWav(): Uint8Array {
  const samples = musicBedSamples()
  const data = samples.length * 2
  const bytes = new Uint8Array(44 + data)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + data, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, data, true)
  for (const [i, s] of samples.entries()) view.setInt16(44 + i * 2, s, true)
  return bytes
}
