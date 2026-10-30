/**
 * Renders a video with its burn-ins drawn (STUDIO ST15): the renderer
 * (`@some-ui/video-render`) with its `recordBurnIn` port filled by the built
 * app's burn-ins page (`./burn-ins.ts`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:short <video folder> --series <series.json> [--out outputs/video.mp4]
 *
 * reads `<video folder>/cut-list.json` and writes the video and
 * `shot-times.json` beside it, as `pnpm --filter @some-ui/video-render
 * render` does without burn-ins. Paths are from where it was typed.
 *
 * It serves the built app (never `vite dev`: the dev tools would be in the
 * frame), from `--dist`, relative to apps/www. Needs `ffmpeg` and
 * `ffprobe` on `PATH`.
 */

import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { chromium } from "@playwright/test"
import { renderFolder } from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"

import { burnInRecorder, openRecorder, RECORDING_SIZE } from "./burn-ins"

const here = (p: string): string =>
  resolve(process.env["INIT_CWD"] ?? process.cwd(), p)

/** Stops the command, saying why; the last lines print it and set the exit code. */
class Refused extends Error {}

function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      series: { type: "string" },
      out: { type: "string", default: "outputs/video.mp4" },
      dist: { type: "string", default: "dist" },
    },
  })
  const [folder] = positionals
  if (!folder || !values.series)
    fail(["usage: record:short <folder> --series <series.json>"])
  const root = here(folder)

  const site = await serve(resolve(values.dist), { fallback: "index.html" })
  const browser = await chromium.launch(
    process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {}
  )
  try {
    const page = await browser.newPage({
      viewport: RECORDING_SIZE,
      deviceScaleFactor: 1,
    })
    await openRecorder(page, site.origin)
    const reasons: Array<string> = []
    const done = await renderFolder(root, here(values.series), {
      workDir: "outputs/cache",
      out: values.out,
      recordBurnIn: burnInRecorder(page, root, (line) => reasons.push(line)),
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems, ...reasons])
    process.stdout.write(
      `wrote ${join(root, done.value.video)} and ${join(root, done.value.shotTimesFile)}\n`
    )
  } finally {
    await browser.close()
    await site.close()
  }
}

try {
  await main()
} catch (e) {
  if (!(e instanceof Refused)) throw e
  process.stderr.write(`${e.message}\n`)
  process.exitCode = 1
}
