/**
 * The sound kit we make ourselves (HYPER4, #2727): the six cues a series
 * names (`SOUNDS`), synthesised here from arithmetic alone, by the same
 * synthesiser as the music bed (`synth.ts`), so they hold no sample, no
 * model's output and no one else's recording, and come out as the same
 * bytes on every machine. The files are never committed: the owner writes
 * them to `${STORAGE}/brand/sounds/` on home (`render sounds --out`), where
 * a series pins each by its sum (`CUES`) and the renderer refuses one that
 * changed.
 *
 * Each is short and dry, at -6 dBFS peak; the series lowers the kit under
 * the voice (`soundGainDb`). A noise is the fixed dice's (`dice`), a pitch
 * that slides changes by a fixed factor each sample, and a filter is one
 * pole, so nothing here asks the engine for a sine, exponential or power.
 *
 * A changed cue is a new version: its sum, its file name and the series
 * that pins it move together.
 */

import {
  addTone,
  dice,
  pcm16,
  pluck,
  SAMPLE_RATE,
  sin2pi,
  swell,
  wavOf,
} from "./synth"
import type { Sound } from "./vocabulary"

/** Each cue's file in `${STORAGE}/brand/sounds/`, and its `sha256sum`. */
export const CUES: Readonly<
  Record<Sound, { readonly file: string; readonly sha256: string }>
> = {
  whoosh: {
    file: "whoosh-v1.wav",
    sha256: "2a46346c0d03281b4f8dfc73eb2d415dc14d51e70d7b82047dd0250e5c824a6a",
  },
  click: {
    file: "click-v1.wav",
    sha256: "e56fca071057709ecb90c44078dbebba0c3a7cc9e3e94d983df64d0104aa182a",
  },
  pop: {
    file: "pop-v1.wav",
    sha256: "20c255e78a2458134c7388cfab4f19cc228adb03935b31fa8c190fb6561e01c9",
  },
  thud: {
    file: "thud-v1.wav",
    sha256: "2ed62149277522ff29981d40cb07e6d82c0fd4a51a877dcb4cc8963f145511c2",
  },
  riser: {
    file: "riser-v1.wav",
    sha256: "867f00cca50af4250b3275b33cba1e72715eeb560e75c7f2fec054c2dda7780e",
  },
  ding: {
    file: "ding-v1.wav",
    sha256: "f78265d321764292a2cb9478e8bcb81bbb0d201a37738d872d70c61e83742b3e",
  },
}

const samples = (seconds: number): number => Math.round(seconds * SAMPLE_RATE)

/** White noise in [-1, 1) from the fixed dice. */
function noise(length: number, seed: number): Float64Array {
  const roll = dice(seed)
  return Float64Array.from({ length }, () => roll() * 2 - 1)
}

/** A one-pole low-pass whose coefficient, from 0 to 1, may move: `a(i)`. */
function lowPass(x: Float64Array, a: (i: number) => number): Float64Array {
  let y = 0
  return x.map((v, i) => {
    y += a(i) * (v - y)
    return y
  })
}

/** `a` to `b` as `i` goes from 0 to `n`. */
const toward =
  (a: number, b: number, n: number) =>
  (i: number): number =>
    a + ((b - a) * Math.min(i, n)) / n

/**
 * A sine whose pitch slides from `from` Hz by `factor` each sample until it
 * reaches `to`, at level `gain(i)`.
 */
function glide(
  length: number,
  from: number,
  to: number,
  factor: number,
  gain: (i: number) => number
): Float64Array {
  let hz = from
  let phase = 0
  return Float64Array.from({ length }, (_, i) => {
    const v = sin2pi(phase) * gain(i)
    phase += hz / SAMPLE_RATE
    phase -= Math.floor(phase)
    hz = factor < 1 ? Math.max(to, hz * factor) : Math.min(to, hz * factor)
    return v
  })
}

const mix = (...parts: ReadonlyArray<Float64Array>): Float64Array => {
  const out = new Float64Array(Math.max(...parts.map((p) => p.length)))
  for (const part of parts)
    for (const [i, v] of part.entries()) out[i] = (out[i] ?? 0) + v
  return out
}

/** Air moving past: noise through a band that opens and closes, 0.9 s. */
function whoosh(): Float64Array {
  const n = samples(0.9)
  const open = (i: number): number =>
    i < n / 2
      ? toward(0.02, 0.3, n / 2)(i)
      : toward(0.3, 0.02, n / 2)(i - n / 2)
  const bright = lowPass(noise(n, 27271), open)
  const body = lowPass(bright, () => 0.01)
  const gain = swell(1, n * 0.45, n * 0.5, n * 0.5)
  return bright.map((v, i) => (v - (body[i] ?? 0)) * gain(i))
}

/** A dry tick, for a tap: a bright tone gone in a few milliseconds, 0.09 s. */
function click(): Float64Array {
  const n = samples(0.09)
  const out = new Float64Array(n)
  addTone(
    out,
    0,
    n,
    2205,
    [
      [1, 1],
      [2, 0.3],
    ],
    pluck(1, 0.9985),
    { wrap: false }
  )
  const tick = lowPass(noise(samples(0.003), 27272), () => 0.6)
  return mix(
    out,
    tick.map((v) => v * 0.4)
  )
}

/** A bubble: a pitch falling fast and a short decay, 0.28 s. */
function pop(): Float64Array {
  const n = samples(0.28)
  return glide(n, 882, 294, 0.99962, pluck(1, 0.99935))
}

/** A soft weight landing: a low falling pitch and a muffled knock, 0.5 s. */
function thud(): Float64Array {
  const n = samples(0.5)
  const tone = glide(n, 118, 49, 0.99988, pluck(1, 0.99986))
  const knock = lowPass(noise(samples(0.04), 27273), () => 0.04).map(
    (v, i, all) => v * (1 - i / all.length) * 3
  )
  return mix(tone, knock)
}

/** Tension rising: noise brightening under a climbing tone, 1.5 s. */
function riser(): Float64Array {
  const n = samples(1.5)
  const air = lowPass(noise(n, 27274), toward(0.01, 0.35, n))
  const tone = glide(n, 196, 784, 1.0000193, () => 0.35)
  const gain = swell(1, n * 0.95, n * 0.97, n * 0.03)
  return mix(air, tone).map((v, i) => v * gain(i))
}

/** A small bell, for the close: struck, ringing out, 1.4 s. */
function ding(): Float64Array {
  const n = samples(1.4)
  const out = new Float64Array(n)
  addTone(
    out,
    0,
    n,
    1323,
    [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ],
    pluck(1, 0.99993),
    { wrap: false }
  )
  return out
}

const MAKE: Readonly<Record<Sound, () => Float64Array>> = {
  whoosh,
  click,
  pop,
  thud,
  riser,
  ding,
}

/** `x` with its last 10 ms faded out, so no cue ends on a step. */
function faded(x: Float64Array): Float64Array {
  const tail = samples(0.01)
  return x.map((v, i) =>
    i < x.length - tail ? v : (v * (x.length - 1 - i)) / tail
  )
}

/** Cue `sound` as a WAV file's bytes, its peak at half of full scale. */
export const cueWav = (sound: Sound): Uint8Array =>
  wavOf(pcm16(faded(MAKE[sound]()), 0.5))
