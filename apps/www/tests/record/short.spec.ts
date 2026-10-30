/**
 * The burn-in recorder in CI (STUDIO ST15, #2273): a short with captions, a
 * headline and the authorship mark, rendered twice through `record:short`'s
 * path (the built app's `/burn-ins?record` page filling the renderer's
 * `recordBurnIn`), gives the same MP4 and the same burn-in recordings both
 * times. Its sources are made here by ffmpeg, so it needs nothing from Drive.
 *
 * Needs the built app (`pnpm --filter www build`, or `WWW_DIST`) and
 * `ffmpeg` on `PATH`.
 */

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { expect, test } from "@playwright/test"
import type { Shot } from "@some-ui/video-render"
import { nodePorts } from "@some-ui/video-render/node"
import { capture, cutList, shot } from "@some-ui/video-render/testing"
import { serve } from "@tests/ui-fit/harness"

import { openRecorder, RECORDING_SIZE, renderWithBurnIns } from "./burn-ins"

const DIST = resolve(process.env["WWW_DIST"] ?? "dist")
const SERIES = resolve(
  "../../packages/video-render/src/sample/build-journal-short.json"
)

type Word = { text: string; startMs: number; endMs: number }

const words = (line: string, fromMs: number): Array<Word> =>
  line.split(" ").map((text, i) => ({
    text,
    startMs: fromMs + i * 300,
    endMs: fromMs + i * 300 + 260,
  }))

const card = (id: string): Shot =>
  shot(id, { picture: { kind: "card" }, durationMs: 1000 })

const CUT_LIST = cutList(
  [
    card("intro"),
    shot("S1", {
      picture: capture(0),
      durationMs: 1500,
      take: { file: "voice/a.wav", inMs: 0, outMs: 1000 },
      burnIns: [
        {
          kind: "headline",
          design: "v1",
          params: {
            kicker: "BUILD JOURNAL · CHECK",
            headline: "The recorder draws the same frames twice",
            line: "Rendered in CI from sources ffmpeg made",
          },
        },
      ],
    }),
    shot("S2", {
      picture: capture(1500),
      durationMs: 1500,
      idea: {
        origin: "source",
        from: { title: "The burn-ins README", ref: "packages/ui/burn-ins" },
      },
    }),
    card("outro"),
  ],
  {
    title: "Recorder check",
    series: { id: "build-journal-short", version: 1 },
    look: "plain",
    burnIns: [
      {
        kind: "captions",
        design: "gridiron",
        params: {
          lines: [
            { words: words("Every word on screen", 1100) },
            { words: words("comes from one place", 2600) },
          ],
        },
      },
      { kind: "authorship", design: "cells-v1", params: {} },
    ],
  }
)

test.describe("the burn-in recorder", () => {
  test.describe.configure({ timeout: 300_000 })

  let root = ""
  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "record-short-"))
    const ports = nodePorts(root)
    for (const dir of ["captures", "voice"]) await ports.mkdir(dir)
    const sources = [
      [
        ...["-f", "lavfi", "-i", "testsrc2=s=206x458:r=30:d=4"],
        ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "captures/walk.mp4"],
      ],
      [
        ...["-f", "lavfi", "-i", "sine=f=330:d=1:r=48000"],
        ...["-c:a", "pcm_s16le", "voice/a.wav"],
      ],
    ]
    for (const args of sources) {
      const made = await ports.ffmpeg({ args: ["-v", "error", "-y", ...args] })
      if (!made.ok) throw new Error(made.stderr)
    }
    await writeFile(join(root, "cut-list.json"), JSON.stringify(CUT_LIST))
  })

  test.afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  test("renders a short with its burn-ins drawn, the same bytes twice", async ({
    browser,
  }) => {
    const site = await serve(DIST, { fallback: "index.html" })
    try {
      const page = await browser.newPage({
        viewport: RECORDING_SIZE,
        deviceScaleFactor: 1,
      })
      await openRecorder(page, site.origin)
      const ports = nodePorts(root)
      const sum = async (file: string): Promise<string> =>
        (await ports.sha256(file)) ?? ""
      const renderOnce = async (
        n: number
      ): Promise<{ video: string; burnIns: Map<string, string> }> => {
        const done = await renderWithBurnIns(page, root, SERIES, {
          workDir: `work-${n}`,
          out: `out-${n}/video.mp4`,
        })
        if (!done.ok) throw new Error(done.problems.join("\n"))
        const recorded = (await readdir(join(root, `work-${n}`))).filter((f) =>
          f.startsWith("burn-in-")
        )
        return {
          video: await sum(done.value.video),
          burnIns: new Map(
            await Promise.all(
              recorded.map(
                async (f) => [f, await sum(`work-${n}/${f}`)] as const
              )
            )
          ),
        }
      }
      const first = await renderOnce(1)
      const second = await renderOnce(2)
      // Captions, the mark and the headline, so the comparison is not of nothing.
      expect(first.burnIns.size).toBe(3)
      expect(second.burnIns).toEqual(first.burnIns)
      expect(second.video).toBe(first.video)
    } finally {
      await site.close()
    }
  })
})
