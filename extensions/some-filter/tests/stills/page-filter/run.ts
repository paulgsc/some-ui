// Photographs Page Filter's gap for the public site's landing (PAGES #3401,
// story 6): page.html, a light page of ours with one widget inside a closed
// shadow root, first as it is and then under Page Filter, stacked into one
// 4:3 picture, light above and dark below. The widget stays white in both,
// which is the gap the card names.
//
// Usage, from extensions/some-filter after `pnpm build:chromium`:
//   node tests/stills/page-filter/run.ts <out.png>
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH names the browser where Playwright's
// own is not installed. Writes only <out.png>; nothing here is committed
// (C1029).

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { BrowserContext } from "@playwright/test"
import { chromium } from "@playwright/test"

const out = process.argv[2]
if (out === undefined)
  throw new Error("usage: node tests/stills/page-filter/run.ts <out.png>")

const DIST = resolve(import.meta.dirname, "../../../dist")
const PAGE = pathToFileURL(resolve(import.meta.dirname, "page.html")).href
const SIZE = { width: 800, height: 300 }
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]

/** One photograph of the page, with Page Filter loaded or not. */
async function shoot(filtered: boolean): Promise<Buffer> {
  const profile = mkdtempSync(join(tmpdir(), "gap-still-"))
  try {
    const context: BrowserContext = await chromium.launchPersistentContext(
      profile,
      {
        ...(executablePath === undefined ? {} : { executablePath }),
        headless: false,
        viewport: SIZE,
        args: [
          "--headless=new",
          "--allow-file-access-from-files",
          ...(filtered
            ? [
                `--disable-extensions-except=${DIST}`,
                `--load-extension=${DIST}`,
              ]
            : []),
        ],
      }
    )
    try {
      const page = context.pages()[0] ?? (await context.newPage())
      await page.goto(PAGE)
      if (filtered) {
        // The content script marks the page once it has themed it.
        await page.waitForFunction(
          () => document.body.dataset["swThemeApplied"] === "dark",
          undefined,
          { timeout: 10_000, polling: 100 }
        )
      }
      await page.waitForTimeout(500)
      return await page.screenshot({ type: "png" })
    } finally {
      await context.close()
    }
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
}

const [light, dark] = [await shoot(false), await shoot(true)]
const browser = await chromium.launch(
  executablePath === undefined ? {} : { executablePath }
)
try {
  const page = await browser.newPage({
    viewport: { width: SIZE.width, height: SIZE.height * 2 },
  })
  const img = (png: Buffer): string =>
    `<img style="display:block" src="data:image/png;base64,${png.toString("base64")}">`
  await page.setContent(
    `<body style="margin:0">${img(light)}${img(dark)}</body>`
  )
  await page.screenshot({ path: resolve(out), type: "png" })
} finally {
  await browser.close()
}
process.stdout.write(`[gap-still] wrote ${resolve(out)}\n`)
