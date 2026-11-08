/**
 * A scripted walk of an app, replayed in a sandbox that holds only sample
 * data (SFEED7, the smallest part): the app's own built pages, served from
 * one made-up origin with every other request refused, driven by Playwright
 * step by step. Each step's screen is kept as a still (a snip), and each tap
 * as where it landed and when, on the walk's own timeline, never the clock's:
 * a walk's snips and `walk.json` are a function of the app's build and the
 * sample, on one machine.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import type { Page } from "playwright-core"
import { chromium } from "playwright-core"

/** The sandbox's origin: a reserved name, so nothing real is ever reached. */
const SANDBOX = "http://sandbox.invalid"

/** One step: an optional tap, then the screen it leaves, held `holdMs`. */
type Step = {
  readonly label: string
  /** What is tapped first, a Playwright selector; none for the opening. */
  readonly tap?: string
  /** Load the page again after the tap, as reopening a popup does. */
  readonly reopen?: boolean
  readonly holdMs: number
}

export type Walk = {
  readonly app: string
  readonly version: string
  /** The page the walk opens, under the sandbox's origin. */
  readonly page: string
  /** The folder of built files the sandbox serves. */
  readonly root: string
  readonly viewport: { readonly width: number; readonly height: number }
  /** Run in the page before its own scripts: the sample data's stand-ins. */
  readonly sandbox: (page: Page) => Promise<void>
  readonly steps: ReadonlyArray<Step>
}

/** How long before a step's screen its tap lands, so the ring is seen first. */
const TAP_LEAD_MS = 400

/** Snips are taken at twice the CSS size, sharp in a 1080-wide frame. */
const SCALE = 2

/** What a walk leaves beside its snips, as `walk.json` (`some-ui.walk/1`). */
export type WalkFile = {
  readonly schema: "some-ui.walk/1"
  readonly app: string
  readonly version: string
  readonly viewport: {
    readonly width: number
    readonly height: number
    readonly scale: number
  }
  /** Each step's screen, from `atMs` until the next one starts. */
  readonly snips: ReadonlyArray<{
    readonly file: string
    readonly label: string
    readonly atMs: number
  }>
  /** Each tap: when, and where in the snip before it, in CSS px. */
  readonly taps: ReadonlyArray<{
    readonly label: string
    readonly atMs: number
    readonly x: number
    readonly y: number
  }>
  readonly lengthMs: number
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
}

/**
 * Serves `root` at the sandbox's origin and refuses every other request; a
 * file the page asks for that the build lacks is said to `missing`, since a
 * lost stylesheet or script draws a screen that isn't the app's.
 */
async function serve(
  page: Page,
  root: string,
  missing: (path: string) => void
): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== SANDBOX) {
      await route.abort("blockedbyclient")
      return
    }
    const file = normalize(join(root, decodeURIComponent(url.pathname)))
    if (!file.startsWith(normalize(root))) {
      await route.abort("accessdenied")
      return
    }
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: TYPES[extname(file)] ?? "application/octet-stream",
      })
    } catch {
      if (url.pathname !== "/favicon.ico") missing(url.pathname)
      await route.fulfill({ status: 404, body: "" })
    }
  })
}

/** The page settled: fonts loaded and two frames drawn since the last change. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load")
  // A string, run in the page: Node's types have no document.
  await page.evaluate(
    "document.fonts.ready.then(() => new Promise((done) =>" +
      " requestAnimationFrame(() => requestAnimationFrame(done))))"
  )
}

/** Replays `walk` with `chrome`, writing its snips and `walk.json` to `out`. */
export async function runWalk(
  walk: Walk,
  chrome: string,
  out: string
): Promise<WalkFile> {
  await mkdir(join(out, "snips"), { recursive: true })
  const browser = await chromium.launch({ executablePath: chrome })
  try {
    const context = await browser.newContext({
      viewport: walk.viewport,
      deviceScaleFactor: SCALE,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
    })
    const page = await context.newPage()
    // A script error means the screen is not the app's: the walk fails.
    const errors: Array<string> = []
    page.on("pageerror", (e) => errors.push(e.message))
    await serve(page, walk.root, (path) => errors.push(`${path} is not built`))
    await walk.sandbox(page)
    await page.goto(`${SANDBOX}/${walk.page}`)
    await settle(page)

    const snips: Array<WalkFile["snips"][number]> = []
    const taps: Array<WalkFile["taps"][number]> = []
    let atMs = 0
    for (const [i, step] of walk.steps.entries()) {
      if (step.tap && i === 0)
        throw new Error("the first step opens; it taps nothing")
      if (step.tap) {
        const target = page.locator(step.tap)
        const box = await target.boundingBox()
        if (!box) throw new Error(`${step.label}: ${step.tap} is not on screen`)
        taps.push({
          label: step.label,
          atMs: atMs - TAP_LEAD_MS,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        })
        await target.click()
        if (step.reopen) await page.reload()
        await settle(page)
      }
      if (errors.length > 0) {
        throw new Error(`${step.label}: the page failed: ${errors.join("; ")}`)
      }
      const file = `snips/${String(i + 1).padStart(2, "0")}.png`
      await page.screenshot({
        path: join(out, file),
        animations: "disabled",
        caret: "hide",
      })
      snips.push({ file, label: step.label, atMs })
      atMs += step.holdMs
    }
    const made: WalkFile = {
      schema: "some-ui.walk/1",
      app: walk.app,
      version: walk.version,
      viewport: { ...walk.viewport, scale: SCALE },
      snips,
      taps,
      lengthMs: atMs,
    }
    await writeFile(
      join(out, "walk.json"),
      `${JSON.stringify(made, null, 1)}\n`
    )
    return made
  } finally {
    await browser.close()
  }
}
