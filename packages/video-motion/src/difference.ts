/**
 * Where two drawings of one frame differ, for `motion prove`'s refusal
 * (#2739): the box of the pixels that differ, how many do, and the largest
 * change in any channel.
 */

export type Difference = {
  /** Pixels that differ in any channel. */
  readonly pixels: number
  /** The largest change in one channel, 0 to 255. */
  readonly most: number
  /** Inclusive: the first and last column and row that differ. */
  readonly box: {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
  } | null
  /** Differing pixels the second frame draws lighter (by the sum of its channels). */
  readonly lighter: number
  /** The first few differing pixels, as `x,y #first→#second`. */
  readonly samples: ReadonlyArray<string>
}

/** How many differing pixels `samples` keeps. */
const SAMPLES = 4

const hex = (f: Uint8Array, i: number): string =>
  `#${[0, 1, 2].map((c) => (f[i + c] ?? 0).toString(16).padStart(2, "0")).join("")}`

/** Two RGB frames of `width` pixels a row, 3 bytes a pixel. */
export function difference(
  a: Uint8Array,
  b: Uint8Array,
  width: number
): Difference {
  if (a.length !== b.length || a.length % (width * 3) !== 0) {
    throw new Error(
      `frames of ${String(a.length)} and ${String(b.length)} bytes are not the same size, ${String(width)} pixels a row`
    )
  }
  let pixels = 0
  let most = 0
  let lighter = 0
  const samples: Array<string> = []
  let [left, top, right, bottom] = [width, Infinity, -1, -1]
  for (let i = 0; i < a.length; i += 3) {
    let here = 0
    for (let c = 0; c < 3; c++) {
      here = Math.max(here, Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0)))
    }
    if (here === 0) continue
    pixels++
    most = Math.max(most, here)
    const at = i / 3
    const [x, y] = [at % width, Math.floor(at / width)]
    const sum = (f: Uint8Array): number =>
      (f[i] ?? 0) + (f[i + 1] ?? 0) + (f[i + 2] ?? 0)
    if (sum(b) > sum(a)) lighter++
    if (samples.length < SAMPLES) {
      samples.push(`${String(x)},${String(y)} ${hex(a, i)}→${hex(b, i)}`)
    }
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  return {
    pixels,
    most,
    box: pixels === 0 ? null : { left, top, right, bottom },
    lighter,
    samples,
  }
}

/**
 * One line for the log, as `frame 51: 46 pixels in 402,1162–674,1171, at
 * most 46, 40 lighter in the second (402,1162 #111821→#1a2230; …)`.
 */
export const saidOf = (frame: number, d: Difference): string =>
  d.box === null
    ? `frame ${String(frame)}: the same pixels`
    : `frame ${String(frame)}: ${String(d.pixels)} pixels in ${String(d.box.left)},${String(d.box.top)}–${String(d.box.right)},${String(d.box.bottom)}, at most ${String(d.most)}, ${String(d.lighter)} lighter in the second (${d.samples.join("; ")})`
