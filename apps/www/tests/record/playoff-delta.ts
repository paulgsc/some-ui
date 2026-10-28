/**
 * Records one week of Playoff Delta as clips for the vlog: one 1080x1920 clip
 * per slide (its reveal fully played, then a beat to cut on), a still of each
 * slide's settled frame, and the voiceover script with each slide's line and
 * hold. Edit the clips under the voiceover; stretch a hold rather than re-record.
 * Each clip opens on the app booting; voiceover.md says how much to trim.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:playoff-delta --week 9 [--theme mochi] [--out out/playoff-delta]
 *
 * `--week 0` records the legend episode, which teaches the words every week
 * uses.
 *
 * It serves the built app (never `vite dev`: the dev tools would be in the
 * frame) and drives `/playoff-delta?record`, which renders one slide with
 * nothing to press and publishes the week's script on the frame.
 *
 * Clips are .webm (Playwright's screencast); most editors take them as they
 * are. The bundled ffmpeg cannot transcode, so convert with a system one if an
 * editor needs .mp4.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import { THEME_STORAGE_KEY } from "@some-ui/styles/theme"
import { serve } from "@tests/ui-fit/harness"

const SIZE = { width: 1080, height: 1920 }
/** After a slide's hold: a beat of stillness to cut on. */
const TAIL_MS = 600

type ScriptLine = { slide: string; holdMs: number; line: string }

type Script = { week: number; slides: Array<ScriptLine> }

const isLine = (x: unknown): x is ScriptLine =>
  typeof x === "object" &&
  x !== null &&
  typeof Reflect.get(x, "slide") === "string" &&
  typeof Reflect.get(x, "holdMs") === "number" &&
  typeof Reflect.get(x, "line") === "string"

const isScript = (value: unknown): value is Script => {
  if (typeof value !== "object" || value === null) return false
  const slides: unknown = Reflect.get(value, "slides")
  return (
    typeof Reflect.get(value, "week") === "number" &&
    Array.isArray(slides) &&
    slides.every(isLine)
  )
}

const { values } = parseArgs({
  options: {
    week: { type: "string", default: "9" },
    theme: { type: "string" },
    out: { type: "string", default: "out/playoff-delta" },
    dist: { type: "string", default: "dist" },
  },
})

const week = Number(values.week)
const outDir = resolve(values.out, `week-${String(week).padStart(2, "0")}`)
const site = await serve(resolve(values.dist), { fallback: "index.html" })
const browser = await chromium.launch(
  process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
    : {}
)

const fmt = (ms: number): string => `${(ms / 1000).toFixed(1)}s`

/** "01", "02": clips sort in story order. */
const ordinal = (i: number): string => String(i + 1).padStart(2, "0")

const url = (slide: number): string =>
  `${site.origin}/playoff-delta?week=${week}&slide=${slide}&record=true`

/** A page at the recording size, in the chosen theme. */
async function open(
  video?: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: video, size: SIZE } } : {}),
  })
  if (values.theme) {
    const theme = values.theme
    await context.addInitScript(
      ({ key, id }) => {
        window.localStorage.setItem(key, id)
      },
      { key: THEME_STORAGE_KEY, id: theme }
    )
  }
  return { context, page: await context.newPage() }
}

try {
  await mkdir(outDir, { recursive: true })

  // The week's script, as the stage publishes it.
  const probe = await open()
  await probe.page.goto(url(0))
  const raw = await probe.page
    .locator("[data-pd-script]")
    .getAttribute("data-pd-script")
  await probe.context.close()
  const parsed: unknown = JSON.parse(raw ?? "null")
  if (!isScript(parsed)) throw new Error("the stage published no script")
  // The stage shows the first week for one it does not have.
  if (parsed.week !== week) throw new Error(`the season has no week ${week}`)
  const script = parsed.slides
  /** Where each clip's slide appears, after the app's boot frames. */
  const starts: Array<number> = []

  for (const [i, entry] of script.entries()) {
    const name = `${ordinal(i)}-${entry.slide}`
    const tmp = join(outDir, ".video")
    const { context, page } = await open(tmp)
    const opened = Date.now()
    await page.goto(url(i))
    await page.locator(`[data-slide="${entry.slide}"]`).waitFor()
    starts.push(Date.now() - opened)
    await page.waitForTimeout(entry.holdMs + TAIL_MS)
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    const video = page.video()
    await context.close()
    if (video) await rename(await video.path(), join(outDir, `${name}.webm`))
    console.log(`recorded ${name} (slide from ${fmt(starts[i] ?? 0)})`)
  }

  const lines = script.map(
    (s, i) =>
      `${ordinal(i)} ${s.slide} (${fmt(s.holdMs)}, trim the clip's first ${fmt(starts[i] ?? 0)})\n   ${s.line}\n`
  )
  await rm(join(outDir, ".video"), { recursive: true, force: true })
  await writeFile(
    join(outDir, "voiceover.md"),
    `# Playoff Delta, week ${week}\n\n${lines.join("\n")}`
  )
  console.log(`wrote ${script.length} clips and voiceover.md to ${outDir}`)
} finally {
  await browser.close()
  await site.close()
}
