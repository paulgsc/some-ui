/**
 * A small synthesiser for the sounds we make ourselves (#2673): the music
 * bed (`music-bed.ts`) and the sound kit's cues (HYPER4, #2727). Nothing it
 * makes holds a sample, a model's output or anyone else's recording.
 *
 * The same bytes on every machine, not only on one: every sample comes from
 * `+`, `-`, `*`, `/` and `Math.floor`, which IEEE 754 rounds exactly the
 * same everywhere. Never the engine's sine, exponential or power, whose
 * last bit an engine may choose: the sine is a fixed polynomial (`sin2pi`),
 * a decay is a fixed factor per sample, and a caller's pitches are ratios
 * of whole numbers. Random choices come from an integer generator with a
 * fixed seed (`dice`). Lint holds this module and its callers to that
 * (`eslint.config.js`).
 *
 * It writes mono 48 kHz 16-bit WAV (`wavOf`), what the renderer reads.
 */

/** Samples a second. */
export const SAMPLE_RATE = 48_000

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

/** A voice's colour: each partial's ratio to its pitch, and its level. */
export type Partials = ReadonlyArray<readonly [ratio: number, level: number]>

/**
 * One sine voice with its partials, added into `out` from `start` for
 * `length` samples. Past the end it wraps to the start, for a loop, or with
 * `wrap: false` stops there. `gain(i)` is its level `i` samples in.
 */
export function addTone(
  out: Float64Array,
  start: number,
  length: number,
  hz: number,
  partials: Partials,
  gain: (i: number) => number,
  { wrap = true }: { readonly wrap?: boolean } = {}
): void {
  const steps = partials.map(([ratio]) => (hz * ratio) / SAMPLE_RATE)
  const phases = partials.map(() => 0)
  for (let i = 0; i < length; i++) {
    let v = 0
    for (let k = 0; k < partials.length; k++) {
      v += (partials[k]?.[1] ?? 0) * sin2pi(phases[k] ?? 0)
      const next = (phases[k] ?? 0) + (steps[k] ?? 0)
      phases[k] = next - Math.floor(next)
    }
    if (!wrap && start + i >= out.length) return
    const at = (start + i) % out.length
    out[at] = (out[at] ?? 0) + v * gain(i)
  }
}

/** Fades in over `rise`, holds, and fades out over `fall` from `hold`. */
export const swell =
  (level: number, rise: number, hold: number, fall: number) =>
  (i: number): number =>
    level *
    (i < rise ? ease(i / rise) : 1) *
    (i < hold ? 1 : 1 - ease(Math.min(1, (i - hold) / fall)))

/** A pluck: a 5 ms rise, then a decay by a fixed factor each sample. */
export function pluck(level: number, factor: number): (i: number) => number {
  const rise = SAMPLE_RATE * 0.005
  let decay = 1
  return (i) => {
    if (i < rise) return (level * i) / rise
    decay *= factor
    return level * decay
  }
}

/** A fixed integer sequence (Numerical Recipes' LCG): the melody's dice. */
export function dice(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** `x` as 16-bit samples, scaled so its peak is `peak` of full scale. */
export function pcm16(x: Float64Array, peak: number): Int16Array {
  let top = 0
  for (const v of x) top = Math.max(top, v < 0 ? -v : v)
  const scale = top > 0 ? peak / top : 0
  const out = new Int16Array(x.length)
  for (const [i, v] of x.entries()) out[i] = Math.round(v * scale * 32767)
  return out
}

/** `samples` as a mono 48 kHz 16-bit WAV file's bytes. */
export function wavOf(samples: Int16Array): Uint8Array {
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
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, data, true)
  for (const [i, s] of samples.entries()) view.setInt16(44 + i * 2, s, true)
  return bytes
}
