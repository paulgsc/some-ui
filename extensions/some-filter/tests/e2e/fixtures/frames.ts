/**
 * Frame-level pixel oracle for Gate 0 falsification specs (G0.2/G0.3/G0.5).
 *
 * `pixels.ts`'s `brightestIn` samples one moment, tens of ms late. Canon
 * Definition C.0's zero-leak invariant covers *every* render opportunity ("a
 * single visible unmasked frame... is a completed failure"), and a late
 * screenshot cannot tell "never painted natively" from "painted natively for
 * one frame".
 *
 * This records video for the window under test (CDP screencast, as
 * Playwright's `video: "on"`) and decodes *every* frame. Not a formal
 * zero-missed-frames proof — the screencast is not vsync-locked, and a frame
 * superseded within one interval could be missed — but the strongest oracle
 * this stack allows without rebuilding the harness, and reported as such.
 */

import { execFileSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import type { BrowserContext, Page } from "@playwright/test"

import { pageCreatedAt } from "./gate0-fixture"
import { luminance8Bit, type Region, type SampledColor } from "./pixels"

function ffmpegPath(): string {
  const fromEnv = process.env["PLAYWRIGHT_FFMPEG_EXECUTABLE_PATH"]
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv

  // Playwright vendors its own ffmpeg under $PLAYWRIGHT_BROWSERS_PATH as
  // `ffmpeg-<rev>/ffmpeg-linux`, so the directory is found by prefix.
  const browsersPath = process.env["PLAYWRIGHT_BROWSERS_PATH"]
  if (browsersPath !== undefined && fs.existsSync(browsersPath)) {
    const rev = fs
      .readdirSync(browsersPath)
      .find((name) => name.startsWith("ffmpeg-"))
    if (rev !== undefined) {
      const candidate = path.join(browsersPath, rev, "ffmpeg-linux")
      if (fs.existsSync(candidate)) return candidate
    }
  }

  throw new Error(
    "[FILTER] frames.ts could not locate an ffmpeg binary. Set " +
      "PLAYWRIGHT_FFMPEG_EXECUTABLE_PATH, or run somewhere that exposes " +
      "one via $PLAYWRIGHT_BROWSERS_PATH/ffmpeg-*/ffmpeg-linux (Playwright's " +
      "own vendored copy)."
  )
}

export type FrameSample = {
  readonly frameIndex: number
  /** Seconds since the video's first frame, per ffmpeg's constant output rate. */
  readonly atSeconds: number
  readonly brightest: SampledColor
}

/**
 * Decodes a PNG's pixels as `pixels.ts`'s `brightestIn` does, via `Image`/
 * `canvas` in a scratch page: no PNG npm dependency, and one decode path for
 * both modules.
 */
async function brightestInPng(
  scratch: Page,
  pngBuffer: Buffer,
  region?: Region
): Promise<SampledColor> {
  const sampled = await scratch.evaluate(
    async ({ b64, region }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (ctx === null) throw new Error("no 2d context")
      ctx.drawImage(img, 0, 0)
      const rx = region?.x ?? 0
      const ry = region?.y ?? 0
      const rw = region?.width ?? img.width
      const rh = region?.height ?? img.height
      const { data } = ctx.getImageData(rx, ry, rw, rh)
      const seen = new Map<string, [number, number, number]>()
      for (let y = 0; y < rh; y += 4) {
        for (let x = 0; x < rw; x += 4) {
          const i = (y * rw + x) * 4
          const px: [number, number, number] = [
            data[i] ?? 0,
            data[i + 1] ?? 0,
            data[i + 2] ?? 0,
          ]
          seen.set(px.join(","), px)
        }
      }
      return Array.from(seen.values())
    },
    { b64: pngBuffer.toString("base64"), region }
  )

  const ranked = sampled
    .map((color) => ({ color, luminance: luminance8Bit(color) }))
    .sort((a, b) => b.luminance - a.luminance)
  const top = ranked[0]
  if (top === undefined) throw new Error("no pixels sampled")
  return top
}

/**
 * Runs `fn` while `page` is video-recorded, then returns the brightest pixel
 * in every decoded frame.
 *
 * `page` must come from a context created with `recordVideo` (see
 * `gate0-fixture.ts`). `page.video()` finalizes only on close, so this
 * closes `page`; callers needing it afterwards must open a fresh one.
 */
export async function captureFrames(
  context: BrowserContext,
  page: Page,
  fn: () => Promise<void>,
  opts?: { region?: Region; fps?: number }
): Promise<ReadonlyArray<FrameSample>> {
  const video = page.video()
  if (video === null) {
    throw new Error(
      "captureFrames: page has no video sink. The owning context must be " +
        "created with recordVideo: { dir } (see gate0-fixture.ts) --- the " +
        "shared some-filter fixture (fixture.ts) does not enable this, by " +
        "design, since it would record every spec in the suite."
    )
  }

  // Recording starts at page creation, before setup; without skipping that
  // interval, a loading colour or encoder keyframe from setup reads as a
  // leak (seen: a "leak" at frameIndex 0). `-ss` after `-i` seeks
  // frame-accurately; these clips are ~1s, so the cost is negligible.
  const createdAt = pageCreatedAt.get(page)
  const skipSeconds =
    createdAt === undefined
      ? 0
      : Math.max(0, (Date.now() - createdAt) / 1000 - 0.02)

  await fn()
  await page.close()
  const videoPath = await video.path()

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-frames-"))
  // The bundled ffmpeg is minimal (no `fps` filter), so no `-vf`: every
  // recorded frame decodes exactly once, which is also truer than a
  // resampled stream. `atSeconds` uses `opts.fps` as a display label only.
  const displayFps = opts?.fps ?? 25
  try {
    execFileSync(ffmpegPath(), [
      "-i",
      videoPath,
      // After -i: an accurate seek that never skips past fn()'s first effect.
      ...(skipSeconds > 0 ? ["-ss", skipSeconds.toFixed(3)] : []),
      path.join(outDir, "frame-%05d.png"),
    ])

    const files = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith(".png"))
      .sort()

    const scratch = await context.newPage()
    try {
      const samples: Array<FrameSample> = []
      for (const [index, file] of files.entries()) {
        const buf = fs.readFileSync(path.join(outDir, file))
        const brightest = await brightestInPng(scratch, buf, opts?.region)
        samples.push({
          frameIndex: index,
          atSeconds: index / displayFps,
          brightest,
        })
      }
      return samples
    } finally {
      await scratch.close()
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

/** The first frame (if any) whose brightest sampled pixel exceeds `DARK` (pixels.ts) --- i.e. the first frame carrying a visible native-bright leak. */
export function firstLeak(
  samples: ReadonlyArray<FrameSample>,
  darkCeiling: number
): FrameSample | undefined {
  return samples.find((s) => s.brightest.luminance > darkCeiling)
}
