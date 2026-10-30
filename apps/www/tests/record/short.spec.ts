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

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { expect, test } from "@playwright/test"
import { renderFolder } from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"

import { burnInRecorder, openRecorder, RECORDING_SIZE } from "./burn-ins"

const DIST = resolve(process.env["WWW_DIST"] ?? "dist")
const SERIES = resolve(
  "../../packages/video-render/src/sample/build-journal-short.json"
)

const run = promisify(execFile)

async function ffmpeg(
  root: string,
  args: ReadonlyArray<string>
): Promise<void> {
  await run("ffmpeg", ["-v", "error", "-y", ...args], { cwd: root })
}

const sha = async (file: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex")

type Word = { text: string; startMs: number; endMs: number }

const words = (line: string, fromMs: number): Array<Word> =>
  line.split(" ").map((text, i) => ({
    text,
    startMs: fromMs + i * 300,
    endMs: fromMs + i * 300 + 260,
  }))

const capture = (inMs: number): Record<string, unknown> => ({
  kind: "capture",
  source: "captures/walk.mp4",
  inMs,
  speed: 1,
  cssWidth: 206,
  framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
  taps: [],
})

const CUT_LIST = {
  schema: "some-ui.cut-list/2",
  title: "Recorder check",
  series: { id: "build-journal-short", version: 1 },
  look: "plain",
  voice: "ad-lib",
  shots: [
    { id: "intro", picture: { kind: "card" }, durationMs: 1000 },
    {
      id: "S1",
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
    },
    {
      id: "S2",
      picture: capture(1500),
      durationMs: 1500,
      idea: {
        origin: "source",
        from: { title: "The burn-ins README", ref: "packages/ui/burn-ins" },
      },
    },
    { id: "outro", picture: { kind: "card" }, durationMs: 1000 },
  ],
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
    { kind: "authorship", design: "cells-v1" },
  ],
}

test.describe("the burn-in recorder", () => {
  test.describe.configure({ timeout: 300_000 })

  let root = ""
  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "record-short-"))
    for (const dir of ["captures", "voice"]) await mkdir(join(root, dir))
    await ffmpeg(root, [
      ...["-f", "lavfi", "-i", "testsrc2=s=206x458:r=30:d=4"],
      ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "captures/walk.mp4"],
    ])
    await ffmpeg(root, [
      ...["-f", "lavfi", "-i", "sine=f=330:d=1:r=48000"],
      ...["-c:a", "pcm_s16le", "voice/a.wav"],
    ])
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
      // One render into its own folders: the video's sum and each recording's.
      const renderOnce = async (
        n: number
      ): Promise<{ video: string; burnIns: Map<string, string> }> => {
        const reasons: Array<string> = []
        const done = await renderFolder(root, SERIES, {
          workDir: `work-${n}`,
          out: `out-${n}/video.mp4`,
          recordBurnIn: burnInRecorder(page, root, (l) => reasons.push(l)),
        })
        if (!done.ok) throw new Error([...done.problems, ...reasons].join("\n"))
        const work = join(root, `work-${n}`)
        const recorded = (await readdir(work)).filter((f) =>
          f.startsWith("burn-in-")
        )
        return {
          video: await sha(join(root, done.value.video)),
          burnIns: new Map(
            await Promise.all(
              recorded.map(async (f) => [f, await sha(join(work, f))] as const)
            )
          ),
        }
      }
      const first = await renderOnce(1)
      const second = await renderOnce(2)
      expect([...first.burnIns.keys()].sort()).toEqual([
        "burn-in-0-captions.mov",
        "burn-in-1-authorship.mov",
        "burn-in-S1-0-headline.mov",
      ])
      expect(second.burnIns).toEqual(first.burnIns)
      expect(second.video).toBe(first.video)
    } finally {
      await site.close()
    }
  })
})
