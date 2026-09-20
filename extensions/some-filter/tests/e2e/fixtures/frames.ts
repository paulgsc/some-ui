/**
 * Frame-level pixel oracle for Gate 0 falsification specs (issue #1262's
 * G0.2/G0.3/G0.5).
 *
 * `pixels.ts`'s `brightestIn` samples exactly one point in time: whatever
 * `page.screenshot()` happens to catch when the test script gets around to
 * calling it, which is bounded below by IPC + PNG-encode latency (tens of
 * ms). Canon Definition C.0's zero-leak invariant is a claim about *every*
 * render opportunity, not the one a polling loop happened to sample --- "a
 * single visible unmasked frame... is a completed failure, not a rare defect
 * to be budgeted against." A screenshot taken 50ms after a mutation cannot
 * distinguish "never painted natively" from "painted natively for one frame,
 * then repainted before the poll landed."
 *
 * This module closes that gap by recording video for the window under test
 * (Chromium's CDP screencast, the same mechanism Playwright's own `video:
 * "on"` option uses) and decoding *every* frame ffmpeg extracts from it, not
 * just a final or periodically-polled one. It is still not a formal proof of
 * zero missed frames --- the screencast is not a vsync-locked capture of the
 * physical display, and a frame the compositor produced and immediately
 * superseded within one screencast interval could in principle still be
 * invisible to it. It is the strongest oracle this tooling stack (Playwright
 * + bundled ffmpeg, no display server, no CDP `HeadlessExperimental.beginFrame`
 * step-by-step driving) can produce without materially rebuilding the harness,
 * and is reported honestly as such rather than as a zero-leak proof.
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

  // Mirrors fixture.ts's PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH resolution:
  // Playwright vendors its own ffmpeg build under $PLAYWRIGHT_BROWSERS_PATH
  // specifically so tooling never depends on a system install. The on-disk
  // layout is `ffmpeg-<rev>/ffmpeg-linux` (no stable unversioned symlink),
  // so the revisioned directory is located by prefix rather than hardcoded.
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
 * Decodes a PNG file's pixels the same way `pixels.ts`'s `brightestIn` does
 * for a live screenshot: via `Image`/`canvas` in a scratch page, never a
 * native Node decoder. Not a redundant choice here either --- it keeps this
 * file dependency-free (no PNG-decoding npm package to add to the lockfile
 * the startup hook already validates against supply-chain policy) and keeps
 * exactly one decode path for both this module and `pixels.ts` to agree on.
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
 * Runs `fn` while `page` is video-recorded, then decodes every frame ffmpeg
 * extracted from the result and returns the brightest pixel seen in each.
 *
 * `page` must belong to a context/page created with `recordVideo` configured
 * (see `gate0-fixture.ts`) --- this module never turns recording on itself,
 * since Playwright only supports configuring it at context-creation time.
 * `page.video()` is only finalized once the page closes, so this closes
 * `page` as part of measurement; callers needing further use of the page
 * must open a fresh one afterward.
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

  // Playwright's video recording starts at page creation, not at this call
  // — every spec here runs real setup first (navigation, waitForClassification,
  // installing a harness-only remedy/primitive) before the window it
  // actually wants measured. Without skipping that interval, a transient
  // loading-state color or an early video-encoder keyframe artifact from
  // *setup* gets analyzed as if it were part of the window under test
  // (confirmed directly: G0.6's first pass reported a "leak" at frameIndex
  // 0, well before sustainedShadowChurn() ever ran). `-ss` after `-i` below
  // does frame-accurate decode-from-start seeking (slower than a pre-`-i`
  // keyframe seek, but these clips are ~1s — cost is negligible), skipping
  // to just before `fn()`'s own first side effect could have painted.
  const createdAt = pageCreatedAt.get(page)
  const skipSeconds =
    createdAt === undefined
      ? 0
      : Math.max(0, (Date.now() - createdAt) / 1000 - 0.02)

  await fn()
  await page.close()
  const videoPath = await video.path()

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-frames-"))
  // Playwright's bundled ffmpeg is a minimal build (`--disable-everything`,
  // only `pad`/`crop`/`scale` filters compiled in — confirmed directly: an
  // `-vf fps=…` resample fails with "No option name near '30'" since the
  // `fps` filter itself is absent). No `-vf` at all: every frame the
  // recorder actually produced is decoded exactly once, one-to-one, via the
  // image2 PNG muxer — a truer frame oracle than a resampled stream would
  // be anyway, since resampling can itself interpolate across or duplicate
  // past a single-frame flash. `atSeconds` below is therefore reported
  // against `opts.fps` as a *display* label only (informational — Chromium's
  // screencast-based recorder in this build reports 25fps), never used to
  // select or skip a frame.
  const displayFps = opts?.fps ?? 25
  try {
    execFileSync(ffmpegPath(), [
      "-i",
      videoPath,
      // Placed after -i (accurate decode-from-start seek, not a keyframe
      // seek) so this never skips *past* fn()'s first real side effect —
      // see this function's own comment above for why this exists at all.
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
