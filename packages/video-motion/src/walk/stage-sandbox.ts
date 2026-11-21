/**
 * The sandbox stage: an app's own built pages, served from one made-up
 * origin with every other request refused, in a Chromium with nothing else
 * in it. Suspender Ledger's popup is walked here (`./suspender-ledger`).
 */

import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import type { Page } from "playwright-core"
import { chromium } from "playwright-core"

import type { Stage } from "./run"

/** The sandbox's origin: a reserved name, so nothing real is ever reached. */
const SANDBOX = "http://sandbox.invalid"

/** Snips are taken at twice the CSS size, sharp in a 1080-wide frame. */
const SCALE = 2

export type SandboxStageSpec = {
  readonly kind: "sandbox"
  /** The build's own version, which the walk shows. */
  readonly version: string
  /** The page the walk opens, under the sandbox's origin. */
  readonly page: string
  /** The folder of built files the sandbox serves. */
  readonly root: string
  readonly viewport: { readonly width: number; readonly height: number }
  /** Run in the page before its own scripts: the sample data's stand-ins. */
  readonly sandbox: (page: Page) => Promise<void>
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
export async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState("load")
  // A string, run in the page: Node's types have no document.
  await page.evaluate(
    "document.fonts.ready.then(() => new Promise((done) =>" +
      " requestAnimationFrame(() => requestAnimationFrame(done))))"
  )
}

export async function openSandboxStage(
  spec: SandboxStageSpec,
  chrome: string
): Promise<Stage> {
  const browser = await chromium.launch({ executablePath: chrome })
  try {
    const context = await browser.newContext({
      viewport: spec.viewport,
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
    await serve(page, spec.root, (path) => errors.push(`${path} is not built`))
    await spec.sandbox(page)
    return {
      page,
      version: spec.version,
      viewport: { ...spec.viewport, scale: SCALE },
      place: (x, y) => ({ x, y }),
      open: async (init): Promise<void> => {
        for (const content of init) await page.addInitScript({ content })
        await page.goto(`${SANDBOX}/${spec.page}`)
      },
      settle: (): Promise<void> => settlePage(page),
      shoot: async (path): Promise<void> => {
        await page.screenshot({ path, animations: "disabled", caret: "hide" })
      },
      problems: (): ReadonlyArray<string> => errors,
      close: () => browser.close(),
    }
  } catch (e) {
    await browser.close()
    throw e
  }
}
