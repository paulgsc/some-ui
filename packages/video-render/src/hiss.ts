/**
 * The hiss taken out of the owner's conditioned takes (HISS1, #3607): the
 * last two stages of the chain the owner picked by ear (C1611, "C2"), after
 * `arnndn` and HOST12's cut and level. Pure functions of a take's samples,
 * so the same take gives the same bytes on the same engine: its windows and
 * twiddles are `synth.ts`'s arithmetic, but its levels are `Math.log10`
 * and `Math.hypot`, whose last bit is the engine's, so the bytes are held
 * by the render image's pinned Node, not by this file alone (it is not one
 * of eslint.config.js's `SAME_BYTES` files):
 *
 * - **The spectral gate** (`spectralGate`): noisereduce's stationary gate
 *   (3.0.3, `stationary=True`), ported so home's render image needs no
 *   Python (C1610). A noise profile from the take's own quietest frames, a
 *   mask over each bin's noise mean plus `nStd` deviations, smoothed, and
 *   the take resynthesised through it. It follows scipy's `stft`/`istft`
 *   as noisereduce calls them: a periodic Hann window, half a window of
 *   zeros at each end, frames that don't fill a window dropped, and the
 *   take filtered in chunks with padding.
 * - **The expander and trim** (`expand`): every 10 ms frame turned down by
 *   how far it sits under the speaking level, held and smoothed so a word's
 *   onset and release open it, floored so a pause is quiet, never dead; the
 *   take then bounded to a lead before its first voiced frame and a tail
 *   after its last, faded at both ends.
 */

import { sin2pi } from "./synth"

/** How the hiss is taken out: the owner's C2 (C1611), as policy (C771). */
export const HISS_POLICY = {
  /** The share of a take's 10 ms frames, quietest first, its noise profile is taken from. */
  profileShare: 0.15,
  /** How much of a bin under the noise threshold is taken away. */
  propDecrease: 0.9,
  /** The FFT and window length. */
  nFft: 2048,
  /** How many of the noise's standard deviations over its mean a bin bears signal. */
  nStd: 1.5,
  /** How far, in Hz, the mask is smoothed across frequency. */
  freqSmoothHz: 500,
  /** How far, in ms, the mask is smoothed across time. */
  timeSmoothMs: 50,
  /** noisereduce's chunk, in samples, and the padding each is filtered with. */
  chunk: 600_000,
  padding: 30_000,
  /** The expander's frame. */
  frameMs: 10,
  /** The share of frames the speaking level sits above. */
  speakingShare: 0.9,
  /** How far under the speaking level the expander is fully open. */
  openUnderSpeakingDb: 22,
  /** How far under that it is fully closed. */
  kneeDb: 8,
  /** Frames the expander stays open each side of an open one. */
  holdFrames: 2,
  /** The Hann window its gain is smoothed with, in frames. */
  smoothFrames: 7,
  /** The least gain it leaves: a pause about 34 dB down, never dead. */
  floor: 0.02,
  /** What is kept before the first voiced frame, and after the last, in frames. */
  leadFrames: 6,
  tailFrames: 14,
  /** The fade at each end. */
  fadeMs: 30,
  /** A take whose speaking level is under this holds no voice at all. */
  silentDb: -100,
} as const

/** cos(2πp), from the same series as `sin2pi`, so every machine draws the same window. */
const cos2pi = (p: number): number => sin2pi((((p + 0.25) % 1) + 1) % 1)

export type HissPolicy = { readonly [K in keyof typeof HISS_POLICY]: number }

/** In place, an iterative radix-2 FFT of `re`/`im`; `inverse` without the 1/n. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i] ?? 0
      re[i] = re[j] ?? 0
      re[j] = tr
      const ti = im[i] ?? 0
      im[i] = im[j] ?? 0
      im[j] = ti
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    for (let k = 0; k < half; k++) {
      const wr = cos2pi(k / size)
      const wi = (inverse ? 1 : -1) * sin2pi(k / size)
      for (let at = k; at < n; at += size) {
        const o = at + half
        const xr = (re[o] ?? 0) * wr - (im[o] ?? 0) * wi
        const xi = (re[o] ?? 0) * wi + (im[o] ?? 0) * wr
        re[o] = (re[at] ?? 0) - xr
        im[o] = (im[at] ?? 0) - xi
        re[at] = (re[at] ?? 0) + xr
        im[at] = (im[at] ?? 0) + xi
      }
    }
  }
}

/** A short-time spectrum: `frames` × `bins` complex values, frame-major. */
type Spectrum = {
  readonly frames: number
  readonly bins: number
  readonly re: Float64Array
  readonly im: Float64Array
}

const hannOf = (n: number): Float64Array =>
  Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * cos2pi(i / n))

/** scipy's `stft` as noisereduce calls it: zeros at both ends, no padding to a whole frame. */
function stft(x: Float64Array, n: number): Spectrum {
  const hop = n / 4
  const win = hannOf(n)
  const scale = 1 / win.reduce((s, w) => s + w, 0)
  const padded = new Float64Array(x.length + n)
  padded.set(x, n / 2)
  const frames = Math.max(0, Math.floor((padded.length - n) / hop) + 1)
  const bins = n / 2 + 1
  const re = new Float64Array(frames * bins)
  const im = new Float64Array(frames * bins)
  const fr = new Float64Array(n)
  const fi = new Float64Array(n)
  for (let t = 0; t < frames; t++) {
    for (let i = 0; i < n; i++) {
      fr[i] = (padded[t * hop + i] ?? 0) * (win[i] ?? 0)
      fi[i] = 0
    }
    fft(fr, fi, false)
    for (let b = 0; b < bins; b++) {
      re[t * bins + b] = (fr[b] ?? 0) * scale
      im[t * bins + b] = (fi[b] ?? 0) * scale
    }
  }
  return { frames, bins, re, im }
}

/** scipy's `istft` of a one-sided spectrum: overlap-added, normalised by the window, its ends cut. */
function istft(s: Spectrum, n: number): Float64Array {
  const hop = n / 4
  const win = hannOf(n)
  const scale = win.reduce((sum, w) => sum + w, 0)
  const length = n + hop * (s.frames - 1)
  const out = new Float64Array(length)
  const norm = new Float64Array(length)
  const fr = new Float64Array(n)
  const fi = new Float64Array(n)
  for (let t = 0; t < s.frames; t++) {
    for (let b = 0; b < s.bins; b++) {
      fr[b] = (s.re[t * s.bins + b] ?? 0) * scale
      fi[b] = (s.im[t * s.bins + b] ?? 0) * scale
    }
    // The other half, conjugate; the DC and Nyquist bins' imaginary parts dropped, as irfft does.
    fi[0] = 0
    fi[n / 2] = 0
    for (let b = 1; b < n / 2; b++) {
      fr[n - b] = fr[b] ?? 0
      fi[n - b] = -(fi[b] ?? 0)
    }
    fft(fr, fi, true)
    for (let i = 0; i < n; i++) {
      const w = win[i] ?? 0
      out[t * hop + i] = (out[t * hop + i] ?? 0) + ((fr[i] ?? 0) / n) * w
      norm[t * hop + i] = (norm[t * hop + i] ?? 0) + w * w
    }
  }
  for (let i = 0; i < length; i++) {
    const w = norm[i] ?? 0
    if (w > 1e-10) out[i] = (out[i] ?? 0) / w
  }
  return out.subarray(n / 2, length - n / 2)
}

const EPS = 2.220446049250313e-16

/** Each bin's level in dB, floored per bin at 80 dB under its loudest frame. */
function dbOf(s: Spectrum): Float64Array {
  const db = new Float64Array(s.frames * s.bins)
  for (let b = 0; b < s.bins; b++) {
    let top = -Infinity
    for (let t = 0; t < s.frames; t++) {
      const k = t * s.bins + b
      const v = 20 * Math.log10(Math.hypot(s.re[k] ?? 0, s.im[k] ?? 0) + EPS)
      db[k] = v
      if (v > top) top = v
    }
    for (let t = 0; t < s.frames; t++) {
      const k = t * s.bins + b
      db[k] = Math.max(db[k] ?? 0, top - 80)
    }
  }
  return db
}

/** noisereduce's smoothing kernel along one axis: a triangle `grad` wide each side of its peak. */
function triangle(grad: number): Float64Array {
  const up = Array.from({ length: grad + 1 }, (_, i) => i / (grad + 1))
  const down = Array.from({ length: grad + 2 }, (_, i) => 1 - i / (grad + 1))
  return Float64Array.from([...up, ...down].slice(1, -1))
}

/** `values` convolved with `kernel` (odd, symmetric) along a strided axis, zeros outside: 'same'. */
function smoothAxis(
  values: Float64Array,
  count: number,
  stride: number,
  lines: number,
  lineStride: number,
  kernel: Float64Array
): Float64Array {
  const out = new Float64Array(values.length)
  const c = (kernel.length - 1) / 2
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride
    for (let i = 0; i < count; i++) {
      let sum = 0
      for (let k = 0; k < kernel.length; k++) {
        const j = i + k - c
        if (j >= 0 && j < count)
          sum += (values[base + j * stride] ?? 0) * (kernel[k] ?? 0)
      }
      out[base + i * stride] = sum
    }
  }
  return out
}

/** The noise threshold for each bin: its mean in dB plus `nStd` deviations, over the noise. */
function thresholdOf(noise: Float64Array, policy: HissPolicy): Float64Array {
  const s = stft(noise, policy.nFft)
  const db = dbOf(s)
  const out = new Float64Array(s.bins)
  for (let b = 0; b < s.bins; b++) {
    let sum = 0
    for (let t = 0; t < s.frames; t++) sum += db[t * s.bins + b] ?? 0
    const mean = s.frames > 0 ? sum / s.frames : 0
    let dev = 0
    for (let t = 0; t < s.frames; t++)
      dev += ((db[t * s.bins + b] ?? 0) - mean) ** 2
    out[b] = mean + policy.nStd * Math.sqrt(s.frames > 0 ? dev / s.frames : 0)
  }
  return out
}

/** One chunk through the gate: its spectrum masked where it is under the noise. */
function gateChunk(
  chunk: Float64Array,
  threshold: Float64Array,
  rate: number,
  policy: HissPolicy
): Float64Array {
  const n = policy.nFft
  const s = stft(chunk, n)
  const db = dbOf(s)
  const p = policy.propDecrease
  let mask: Float64Array = new Float64Array(s.frames * s.bins)
  for (let t = 0; t < s.frames; t++)
    for (let b = 0; b < s.bins; b++) {
      const k = t * s.bins + b
      mask[k] = ((db[k] ?? 0) > (threshold[b] ?? 0) ? 1 : 0) * p + (1 - p)
    }
  const gradFreq = Math.floor(policy.freqSmoothHz / (rate / (n / 2)))
  const gradTime = Math.floor(policy.timeSmoothMs / ((n / 4 / rate) * 1000))
  if (gradFreq > 1 || gradTime > 1) {
    const kf = triangle(gradFreq)
    const kt = triangle(gradTime)
    const total = kf.reduce((a, v) => a + v, 0) * kt.reduce((a, v) => a + v, 0)
    mask = smoothAxis(mask, s.bins, 1, s.frames, s.bins, kf)
    mask = smoothAxis(mask, s.frames, s.bins, s.bins, 1, kt)
    for (let k = 0; k < mask.length; k++) mask[k] = (mask[k] ?? 0) / total
  }
  const re = new Float64Array(s.re.length)
  const im = new Float64Array(s.im.length)
  for (let k = 0; k < re.length; k++) {
    re[k] = (s.re[k] ?? 0) * (mask[k] ?? 0)
    im[k] = (s.im[k] ?? 0) * (mask[k] ?? 0)
  }
  const back = istft({ ...s, re, im }, n)
  const out = new Float64Array(chunk.length)
  out.set(back.subarray(0, Math.min(back.length, chunk.length)))
  return out
}

/** A frame's level in dB, as the session's measure took it: 20·log10 of its RMS, plus 1e-9. */
const levelOf = (x: Float64Array, from: number, size: number): number => {
  let sum = 0
  for (let i = from; i < from + size; i++) sum += (x[i] ?? 0) ** 2
  return 20 * Math.log10(Math.sqrt(sum / size) + 1e-9)
}

/** numpy's `percentile`, linear between the two nearest ranks. */
export function percentileOf(
  values: ReadonlyArray<number>,
  share: number
): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return -Infinity
  const at = share * (sorted.length - 1)
  const lo = Math.floor(at)
  const hi = Math.min(sorted.length - 1, lo + 1)
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (at - lo)
}

/** Each whole `frameMs` frame's level. */
function levelsOf(
  x: Float64Array,
  rate: number,
  policy: HissPolicy
): Array<number> {
  const size = Math.floor((policy.frameMs / 1000) * rate)
  const count = Math.floor(x.length / size)
  return Array.from({ length: count }, (_, i) => levelOf(x, i * size, size))
}

/**
 * The take through noisereduce's stationary gate, its noise profile its
 * own quietest `profileShare` of frames, in order.
 */
export function spectralGate(
  x: Float64Array,
  rate: number,
  policy: HissPolicy = HISS_POLICY
): Float64Array {
  const size = Math.floor((policy.frameMs / 1000) * rate)
  const levels = levelsOf(x, rate, policy)
  const quiet = percentileOf(levels, policy.profileShare)
  const parts: Array<number> = []
  levels.forEach((db, i) => {
    if (db <= quiet)
      for (let j = i * size; j < (i + 1) * size; j++) parts.push(x[j] ?? 0)
  })
  const threshold = thresholdOf(
    Float64Array.from(parts.slice(0, policy.chunk)),
    policy
  )
  const read = (from: number, to: number): Float64Array => {
    const out = new Float64Array(to - from)
    for (let i = Math.max(0, from); i < Math.min(x.length, to); i++)
      out[i - from] = x[i] ?? 0
    return out
  }
  const pad = policy.padding
  const C = policy.chunk
  if (x.length <= C) {
    const done = gateChunk(read(-pad, x.length + pad), threshold, rate, policy)
    return done.slice(pad, pad + x.length)
  }
  const out = new Float64Array(x.length)
  for (let c = 0; c * C < x.length; c++) {
    const done = gateChunk(
      read(c * C - pad, (c + 1) * C + pad),
      threshold,
      rate,
      policy
    )
    const keep = Math.min(C, x.length - c * C)
    out.set(done.subarray(pad, pad + keep), c * C)
  }
  return out
}

/** What the expander kept: the take's samples, and where in the gated take they start, in samples. */
export type Expanded = {
  readonly samples: Float64Array
  readonly fromSample: number
}

/**
 * The gated take through the expander and trimmed: each frame's gain from
 * how far it sits under the speaking level, held, smoothed and floored;
 * then bounded to `leadFrames` before its first voiced frame and
 * `tailFrames` after its last, faded over `fadeMs` at each end. Null when
 * no frame is voiced.
 */
export function expand(
  x: Float64Array,
  rate: number,
  policy: HissPolicy = HISS_POLICY
): Expanded | null {
  const size = Math.floor((policy.frameMs / 1000) * rate)
  const levels = levelsOf(x, rate, policy)
  const k = levels.length
  const speaking = percentileOf(levels, policy.speakingShare)
  if (speaking < policy.silentDb) return null
  const open = speaking - policy.openUnderSpeakingDb
  const voiced = levels.flatMap((db, i) => (db > open ? [i] : []))
  const first = voiced[0]
  const last = voiced.at(-1)
  if (first === undefined || last === undefined) return null
  const a = Math.max(0, first - policy.leadFrames)
  const b = Math.min(k, last + policy.tailFrames)
  const raw = levels.map((db) =>
    Math.min(1, Math.max(0, (db - (open - policy.kneeDb)) / policy.kneeDb))
  )
  const h = policy.holdFrames
  const held = raw.map((_, i) => {
    let most = 0
    for (let j = i - h; j <= i + h; j++) most = Math.max(most, raw[j] ?? 0)
    return most
  })
  const m = policy.smoothFrames
  const hann = Array.from(
    { length: m },
    (_, i) => 0.5 - 0.5 * cos2pi(i / (m - 1))
  )
  const hannSum = hann.reduce((s, v) => s + v, 0)
  const c = Math.floor((m - 1) / 2)
  const gains = held.map((_, i) => {
    let sum = 0
    for (let j = 0; j < m; j++)
      sum += ((held[i + c - j] ?? 0) * (hann[j] ?? 0)) / hannSum
    return Math.max(sum, policy.floor)
  })
  const lastGain = gains.at(-1) ?? policy.floor
  const from = a * size
  const to = b * size
  const y = new Float64Array(to - from)
  for (let i = from; i < to; i++) {
    const frame = Math.floor(i / size)
    y[i - from] = (x[i] ?? 0) * (frame < k ? (gains[frame] ?? 0) : lastGain)
  }
  const n = Math.min(Math.floor((policy.fadeMs / 1000) * rate), y.length)
  for (let i = 0; i < n; i++) {
    const r = n > 1 ? i / (n - 1) : 1
    y[i] = (y[i] ?? 0) * r
    y[y.length - n + i] = (y[y.length - n + i] ?? 0) * (1 - r)
  }
  return { samples: y, fromSample: from }
}
