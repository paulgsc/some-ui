/**
 * Mochi Night's rule 3 (SFEED10, #2675): through the renderer's own colour
 * path, a real x264 encode at 4:2:0 (`TO_VIDEO`, `BT709`), a 1 px stroke of
 * ink or muted ink keeps at least 90% of its contrast with the ground, at
 * either alignment to the chroma grid, and the stream is tagged bt709, so a
 * player decodes it as it was made. Rules 1, 2 and 4 are `@some-ui/styles`'s.
 *
 * Measured, not chosen: an accent's stroke keeps its contrast inside and
 * loses some at an edge that shares chroma with the ground, honey 11% and
 * the warning 18%, which is why accents colour only large text and ink
 * carries the reading. Pure red and blue on black, the research's controls,
 * lose about two thirds, so the check can fail.
 */
import { spawnSync } from "node:child_process"
import { channels, MOCHI_NIGHT } from "@some-ui/styles/theme/video-palette"
import { BT709, TO_VIDEO } from "@video-render/plan"
import { describe, expect, it } from "vitest"

const W = 96
const H = 32

/** A frame of `ground` with a 1 px column of `ink` at `x`, as rgb24. */
function frame(ink: string, ground: string, x: number): Buffer {
  const out = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++)
    out.set(channels(i % W === x ? ink : ground), i * 3)
  return out
}

function ffmpeg(args: ReadonlyArray<string>, input: Buffer): Buffer {
  const ran = spawnSync("ffmpeg", ["-v", "error", ...args], {
    input,
    maxBuffer: 1 << 24,
  })
  if (ran.status !== 0) throw new Error(ran.stderr.toString())
  return ran.stdout
}

/** The frame as the renderer encodes it, then as a player decodes it. */
function roundTrip(raw: Buffer): { pixels: Buffer; tags: string } {
  const encoded = ffmpeg(
    [
      ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-"],
      ...["-vf", `${TO_VIDEO},format=yuv420p`],
      ...["-c:v", "libx264", "-preset", "medium", "-crf", "18"],
      ...["-pix_fmt", "yuv420p", ...BT709, "-f", "matroska", "-"],
    ],
    raw
  )
  const pixels = ffmpeg(
    ["-i", "-", "-vf", "format=rgb24", "-f", "rawvideo", "-"],
    encoded
  )
  const probed = spawnSync(
    "ffprobe",
    [
      ...["-v", "error", "-select_streams", "v:0", "-of", "csv=p=0"],
      ...["-show_entries", "stream=color_space,color_primaries,color_transfer"],
      "-",
    ],
    { input: encoded }
  )
  return { pixels, tags: probed.stdout.toString().trim() }
}

const linear = (c: number): number => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const luminance = (r: number, g: number, b: number): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const pixelLuminance = (pixels: Buffer, x: number, y: number): number => {
  const at = (y * W + x) * 3
  return luminance(pixels[at] ?? 0, pixels[at + 1] ?? 0, pixels[at + 2] ?? 0)
}

/** The share of the stroke's contrast with the ground left after the encode, at its worse alignment. */
function kept(ink: string, ground: string): number {
  const [ir, ig, ib] = channels(ink)
  const [gr, gg, gb] = channels(ground)
  const before = luminance(ir, ig, ib) - luminance(gr, gg, gb)
  return Math.min(
    ...[47, 48].map((x) => {
      const { pixels } = roundTrip(frame(ink, ground, x))
      const y = H / 2
      return (
        (pixelLuminance(pixels, x, y) - pixelLuminance(pixels, x - 8, y)) /
        before
      )
    })
  )
}

const P = MOCHI_NIGHT

describe("Mochi Night through the renderer's encode", () => {
  it("is tagged BT.709, as YouTube reads HD", () => {
    expect(roundTrip(frame(P.ink, P.background, 47)).tags).toBe(
      "bt709,bt709,bt709"
    )
  })

  it("keeps 90% of a 1 px stroke's contrast in ink and muted ink", () => {
    expect(kept(P.ink, P.background)).toBeGreaterThanOrEqual(0.9)
    expect(kept(P.mutedInk, P.background)).toBeGreaterThanOrEqual(0.9)
  })

  it("keeps 80% of an accent's at an edge, for large text", () => {
    for (const accent of [P.honey, P.sky, P.warning, P.success])
      expect(kept(accent, P.background)).toBeGreaterThanOrEqual(0.8)
  })

  it("catches what the research measured: pure red and blue on black lose most", () => {
    expect(kept("#ff0000", "#000000")).toBeLessThan(0.5)
    expect(kept("#0000ff", "#000000")).toBeLessThan(0.5)
  })
})
