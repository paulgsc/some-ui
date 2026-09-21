/**
 * BOYO — regenerate the layout table (BC1, #1434).
 *
 *   pnpm layout:crawl              # the e2e fixtures (offline, deterministic)
 *   pnpm layout:crawl -- --live    # youtube.com, one page per surface
 *
 * Writes `src/lib/content/layout/generated/youtube-layout.ts`. Never edit that
 * file by hand: a hand-written shape can describe a DOM the vendor does not
 * serve, which is the drift this table exists to make visible.
 *
 * The instrument is `fingerprintSurface()` — the same closure-free function
 * the unit suite runs under jsdom — handed to Playwright's `page.evaluate()`,
 * which serializes its source and runs it inside the page. Nothing here
 * decides what a shape *means*; it only records what was there.
 *
 * Live crawls are best-effort: YouTube may show a consent wall or serve a
 * different experiment, and `/feed/subscriptions` renders a sign-in prompt
 * to a browser with no session. A surface whose page showed no catalogue tag
 * at all is left out of the table rather than recorded as empty (see
 * `assembleTable()`), so the `"*"` union serves it. To crawl the signed-in
 * surfaces, point `LAYOUT_CRAWL_STORAGE_STATE` at a Playwright storage-state
 * file (`context.storageState({ path })` from a signed-in session); it is
 * read, never written, and never checked in.
 *
 * Read the diff before committing it — it should be exactly the shapes that
 * changed, and `generatedAt`, nothing else. See
 * `src/lib/content/layout/README.md` for when to recrawl.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  fingerprintInput,
  FIXTURE_TARGETS,
  LIVE_TARGETS,
  type CrawlTarget,
} from "@censor/lib/content/layout/crawl-input"
import { fingerprintSurface } from "@censor/lib/content/layout/fingerprint"
import { isSurfaceLayout } from "@censor/lib/content/layout/schema"
import type {
  LayoutSource,
  LayoutTable,
  SurfaceLayout,
} from "@censor/lib/content/layout/schema"
import { assembleTable } from "@censor/lib/content/layout/table"
import { chromium } from "@playwright/test"
import type { BrowserContext } from "@playwright/test"
import { format, resolveConfig } from "prettier"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = resolve(__dirname, "../tests/e2e/fixtures")
const OUT = resolve(
  __dirname,
  "../src/lib/content/layout/generated/youtube-layout.ts"
)

const live = process.argv.includes("--live")
const source: LayoutSource = live ? "live" : "fixtures"
const targets = live ? LIVE_TARGETS : FIXTURE_TARGETS

async function crawl(): Promise<LayoutTable> {
  const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
  const storageState = live
    ? process.env["LAYOUT_CRAWL_STORAGE_STATE"]
    : undefined
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
  const layouts: Array<SurfaceLayout> = []

  try {
    const context = await browser.newContext({
      ...(storageState ? { storageState } : {}),
    })
    for (const target of targets) {
      const layout = await crawlOne(context, target)
      layouts.push(layout)
      console.log(
        `[layout] ${target.surface} ${target.path}: ${layout.shapes.length} shape(s)`
      )
    }
  } finally {
    await browser.close()
  }

  const { table, skipped } = assembleTable({
    source,
    generator: `pnpm layout:crawl${live ? " -- --live" : ""}`,
    generatedAt: new Date().toISOString(),
    layouts,
  })
  for (const surface of skipped) {
    console.warn(
      `[layout] ${surface}: no catalogue tag observed — left out of the table ` +
        `(the "*" union serves it). A sign-in prompt or consent wall, most ` +
        `likely; set LAYOUT_CRAWL_STORAGE_STATE to crawl signed-in surfaces.`
    )
  }
  return table
}

async function crawlOne(
  context: BrowserContext,
  target: CrawlTarget
): Promise<SurfaceLayout> {
  const page = await context.newPage()
  try {
    const url = live
      ? target.load
      : pathToFileURL(resolve(FIXTURE_DIR, target.load)).href
    await page.goto(url, { waitUntil: "domcontentloaded" })
    if (live) {
      // Let the SPA hydrate and the feed virtualizer fill a few screens; a
      // crawl of the skeleton would record the shell, not the cards.
      //
      // Best-effort, like the rest of a live crawl: a consent or regional
      // interstitial has no `ytd-app` at all, and a wait that threw here
      // used to abort every surface after this one. An unhydrated page is
      // recorded as no shapes instead, which `assembleTable()` leaves out of
      // the table so the "*" union serves the surface.
      const hydrated = await page
        .waitForSelector("ytd-app", { timeout: 20_000 })
        .then(
          () => true,
          () => false
        )
      if (!hydrated) {
        console.warn(
          `[layout] ${target.surface} ${target.path}: no ytd-app within 20s — ` +
            `a consent or regional interstitial, most likely; nothing recorded.`
        )
        return { surface: target.surface, paths: [target.path], shapes: [] }
      }
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, 1200)
        await page.waitForTimeout(800)
      }
    }
    // The instrument's own source, applied to the page's document. A closure
    // calling `fingerprintSurface` would not serialize (it would reference
    // this module's scope), so its source travels as a string and is
    // re-materialized in the page; the input travels as data, the way
    // `page.evaluate()` serializes arguments, never spliced into code.
    const input = fingerprintInput(target.surface, target.path)
    const result: unknown = await page.evaluate(
      ([instrumentSource, instrumentInput]) => {
        // esbuild (under tsx) may decorate the serialized source with a
        // `__name` helper call; the page has no such helper, so a no-op one
        // is bound as the re-materialized function's only free name.
        // eslint-disable-next-line no-new-func, @typescript-eslint/consistent-type-assertions
        const instrument = new Function(
          "__name",
          `return (${instrumentSource})`
        )((fn: unknown) => fn) as typeof fingerprintSurface
        return instrument(document, instrumentInput)
      },
      [fingerprintSurface.toString(), input] as const
    )
    if (!isSurfaceLayout(result)) {
      throw new Error(
        `[layout] ${target.surface}: fingerprint returned an unexpected shape`
      )
    }
    return result
  } finally {
    await page.close()
  }
}

function render(table: LayoutTable): string {
  const from = table.source === "live" ? "youtube.com" : "the e2e fixtures"
  return `// @generated by \`${table.generator}\` (scripts/crawl-layout.ts). Do not edit.
//
// YouTube's card DOM shape per surface, as observed from ${from}
// at ${table.generatedAt}.
//
// A heuristic with a shelf life, not a guarantee — see ../README.md for when
// to regenerate it, and #1433 for why the Sensor reads this instead of
// walking the live tree.

import type { LayoutTable } from "@censor/lib/content/layout/schema"

export const YOUTUBE_LAYOUT = ${JSON.stringify(table, null, 2)} as const satisfies LayoutTable
`
}

const table = await crawl()
const config = (await resolveConfig(OUT)) ?? {}
const formatted = await format(render(table), { ...config, filepath: OUT })
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, formatted)
console.log(`[layout] wrote ${OUT}`)
