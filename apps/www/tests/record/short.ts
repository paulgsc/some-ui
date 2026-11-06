/**
 * Renders a video with its burn-ins drawn (STUDIO ST15): the renderer
 * (`@some-ui/video-render`) with its `recordBurnIn` port filled by the built
 * app's burn-ins page (`./burn-ins.ts`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:short <video folder> --series <series folder> [--out outputs/video.mp4]
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
import { serve } from "@tests/ui-fit/harness"

import { openRecorder, RECORDING_SIZE, renderWithBurnIns } from "./burn-ins"
import { fail, here, launchChromium, runCommand } from "./command"

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
    fail(["usage: record:short <folder> --series <series folder>"])
  const root = here(folder)

  const site = await serve(resolve(values.dist), { fallback: "index.html" })
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: RECORDING_SIZE,
      deviceScaleFactor: 1,
    })
    await openRecorder(page, site.origin)
    const done = await renderWithBurnIns(page, root, here(values.series), {
      workDir: "outputs/cache",
      out: values.out,
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    process.stdout.write(
      `wrote ${join(root, done.value.video)} and ${join(root, done.value.shotTimesFile)}\n`
    )
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
