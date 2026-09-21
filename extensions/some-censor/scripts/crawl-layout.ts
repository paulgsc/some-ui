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
 * different experiment. Read the diff before committing it — it should be
 * exactly the shapes that changed, and `generatedAt`, nothing else. See
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
import {
  fingerprintSurface,
  mergeLayouts,
} from "@censor/lib/content/layout/fingerprint"
import {
  isSurfaceLayout,
  LAYOUT_SCHEMA_VERSION,
} from "@censor/lib/content/layout/schema"
import type {
  LayoutSource,
  LayoutTable,
  SurfaceLayout,
} from "@censor/lib/content/layout/schema"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import { chromium } from "@playwright/test"
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
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
  const layouts = new Map<BoyoSurface, Array<SurfaceLayout>>()

  try {
    for (const target of targets) {
      const layout = await crawlOne(browser, target)
      const list = layouts.get(target.surface) ?? []
      list.push(layout)
      layouts.set(target.surface, list)
      console.log(
        `[layout] ${target.surface} ${target.path}: ${layout.shapes.length} shape(s)`
      )
    }
  } finally {
    await browser.close()
  }

  const surfaces: Partial<Record<BoyoSurface | "*", SurfaceLayout>> = {}
  const all: Array<SurfaceLayout> = []
  for (const [surface, list] of [...layouts].sort(([a], [b]) =>
    a < b ? -1 : 1
  )) {
    const merged = mergeLayouts(surface, list)
    surfaces[surface] = merged
    all.push(merged)
  }
  surfaces["*"] = mergeLayouts("*", all)

  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    source,
    generatedAt: new Date().toISOString(),
    generator: `pnpm layout:crawl${live ? " -- --live" : ""}`,
    surfaces,
  }
}

async function crawlOne(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  target: CrawlTarget
): Promise<SurfaceLayout> {
  const page = await browser.newPage()
  try {
    const url = live
      ? target.load
      : pathToFileURL(resolve(FIXTURE_DIR, target.load)).href
    await page.goto(url, { waitUntil: "domcontentloaded" })
    if (live) {
      // Let the SPA hydrate and the feed virtualizer fill a few screens; a
      // crawl of the skeleton would record the shell, not the cards.
      await page.waitForSelector("ytd-app", { timeout: 20_000 })
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, 1200)
        await page.waitForTimeout(800)
      }
    }
    // The instrument's own source, applied to the page's document. A closure
    // calling `fingerprintSurface` would not serialize (it would reference
    // this module's scope), so the call is spelled as an expression string.
    const input = fingerprintInput(target.surface, target.path)
    // esbuild (under tsx) may decorate the serialized source with a `__name`
    // helper call; the page has no such helper, so a no-op one is provided.
    const expression = `(() => { const __name = (fn) => fn; return (${fingerprintSurface.toString()})(document, ${JSON.stringify(input)}) })()`
    const result: unknown = await page.evaluate(expression)
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
