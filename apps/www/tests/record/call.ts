/**
 * Records and renders one weekly call (STUDIO ST29): a still of each scene
 * from the built app's `/call?record`, each scene's words said in its
 * section's voice, and the renderer (`@some-ui/video-render`) laying them
 * together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:call [--week 2026-10-30] [--voices edge|none] [--out out/call]
 *
 * `--week` names the week by its first day (the newest `paulgsc/testing`
 * keeps by default, `sample` for the template's); the build must be one that
 * reads content, as the home network's does. `--voices edge` says each scene
 * through the `edge-tts` command, in `CALL_VOICES`, until home's own Kokoro
 * voice replaces it (ST36, #2635); `none` leaves the call silent, each scene
 * held for its words' reading time, which the frame shows anyway.
 *
 * It refuses a scene the frame can't hold (`data-overflow`), since the
 * video would cut it off. It serves the built app (never `vite dev`: the dev
 * tools would be in the frame), from `--dist`, relative to apps/www. Needs
 * `ffmpeg` and `ffprobe` on `PATH`.
 */

import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs, promisify } from "node:util"
import {
  CALL_VOICES,
  callCutList,
  callFile,
  callScenes,
  parseCallWeek,
} from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"
import { nodePorts, renderFolder } from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"

import { fail, here, launchChromium, runCommand } from "./command"

const run = promisify(execFile)

/** The frame the stage is recorded at: the call's series. */
const FRAME = { width: 1920, height: 1080 } as const

/** The call's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/conference-call"
)

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      week: { type: "string" },
      voices: { type: "string", default: "none" },
      out: { type: "string", default: "out/call" },
      dist: { type: "string", default: "dist" },
    },
  })
  if (values.voices !== "edge" && values.voices !== "none")
    fail(["--voices is edge or none"])
  const site = await serve(resolve(values.dist), { fallback: "index.html" })
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: FRAME,
      deviceScaleFactor: 1,
    })
    const url = (scene: string): string =>
      `${site.origin}/call?${new URLSearchParams({
        ...(values.week ? { week: values.week } : {}),
        scene,
        record: "true",
      }).toString()}`

    // The week the stage plays, as it publishes it on the frame.
    await page.goto(url("open"))
    const frame = page.locator("[data-scene]")
    await frame.waitFor()
    const published = await frame.getAttribute("data-week")
    if (published === null) fail(["the stage published no week"])
    const parsed = parseCallWeek(JSON.parse(published))
    if (!parsed.ok)
      fail(["The stage's week can't make a call:", ...parsed.problems])
    const week: CallWeek = parsed.value
    if (
      values.week &&
      values.week !== "sample" &&
      week.week.from !== values.week
    )
      fail([`there is no week of ${values.week}`])

    const root = here(join(values.out, week.week.from))
    await mkdir(root, { recursive: true })
    const ports = nodePorts(root)
    const scenes = callScenes(week)
    const takesMs: Array<number | null> = []
    const overflowing: Array<string> = []

    for (const [i, scene] of scenes.entries()) {
      const file = callFile(i, scene.id)
      await page.goto(url(scene.id))
      const shown = page.locator(`[data-scene="${scene.id}"]`)
      await shown.waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      if ((await shown.getAttribute("data-overflow")) === "true")
        overflowing.push(scene.id)
      await page.screenshot({ path: join(root, `${file}.png`) })
      if (values.voices === "edge") {
        await run("edge-tts", [
          "--voice",
          CALL_VOICES[scene.section],
          "--text",
          scene.said,
          "--write-media",
          join(root, `${file}.mp3`),
        ])
        const facts = await ports.probe(`${file}.mp3`)
        if (!facts) fail([`${file}.mp3 can't be read`])
        takesMs.push(Math.round(facts.durationMs))
      } else {
        takesMs.push(null)
      }
      console.log(`recorded ${file}`)
    }
    if (overflowing.length > 0)
      fail([
        "These scenes don't fit the frame, so the video would cut them off:",
        ...overflowing,
      ])

    const cutList = callCutList(week, takesMs)
    await writeFile(
      join(root, "cut-list.json"),
      `${JSON.stringify(cutList, null, 1)}\n`
    )
    await writeFile(
      join(root, "week.json"),
      `${JSON.stringify(week, null, 1)}\n`
    )
    const done = await renderFolder(root, SERIES, {
      workDir: "cache",
      out: "call.mp4",
      withoutBurnIns: true,
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    console.log(`wrote ${join(root, done.value.video)}`)
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
