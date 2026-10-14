/**
 * The veil fails open (canon Definition D.6, ADR 0002 §8.7).
 *
 * Every case here held a viewport-wide dark veil with no end before the
 * bound existed: a start that throws, a content script that never runs, and
 * a parser blocked before `document_end`. Each must now be uncovered within
 * `VEIL_MAX_HOLD_MS` of navigation, plus a scheduling allowance.
 *
 * Times are `performance.now()` in the page, whose origin is the navigation.
 */

import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { VEIL_MAX_HOLD_MS } from "@filter/lib/content/prepaint"
import { expect, test } from "@filter/playwright/fixture"
import { backgroundWorker } from "@filter/playwright/fixtures/legacy-mode"
import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test"

const VEIL_ID = "__sw_prepaint_veil"
/** Timer lateness, the polling interval, and a busy CI host. */
const ALLOWANCE_MS = 500

const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../dist"
)

async function serve(
  context: BrowserContext,
  url: string,
  html: string
): Promise<void> {
  await context.route(url, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html })
  )
}

/** When the veil was last seen gone, in page time; fails past the bound. */
async function veilGoneAt(page: Page): Promise<number> {
  await page.waitForFunction(
    (id) =>
      document.getElementById(id) === null &&
      !document.documentElement.classList.contains("sw-dirty"),
    VEIL_ID,
    { timeout: VEIL_MAX_HOLD_MS + 5_000, polling: 20 }
  )
  return page.evaluate(() => performance.now())
}

/** One of this tab's observability counters, as the debug export reads it. */
async function counter(sw: Worker, page: Page, name: string): Promise<number> {
  const sessionId = await page.evaluate(
    () => document.body.dataset["swObservabilitySession"] ?? ""
  )
  const key = `sf.observability.session.${sessionId}.v1`
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await sw.evaluate(
      async ({ k, n }: { k: string; n: string }) => {
        // eslint-disable-next-line no-restricted-globals
        const store: Record<string, unknown> = await chrome.storage.local.get(k)
        const bundle = store[k]
        if (bundle === null || typeof bundle !== "object") return 0
        const metrics: unknown = Reflect.get(bundle, "metrics")
        if (metrics === null || typeof metrics !== "object") return 0
        const counters: unknown = Reflect.get(metrics, "counters")
        if (counters === null || typeof counters !== "object") return 0
        const value: unknown = Reflect.get(counters, n)
        return typeof value === "number" ? value : 0
      },
      { k: key, n: name }
    )
    if (value > 0) return value
    await page.waitForTimeout(100)
  }
  return 0
}

test.describe("the veil fails open", () => {
  test("a page that removes <head> before content.js starts: the veil lifts within the bound and the abandonment is counted", async ({
    context,
  }) => {
    const sw = await backgroundWorker(context)
    const url = "https://veil-fail-open.test/no-head.html"
    await serve(
      context,
      url,
      `<!doctype html><html><head><title>t</title></head><body style="background:#fff"><p>hello</p><script>document.head.remove()</script></body></html>`
    )
    const page = await context.newPage()
    await page.bringToFront()
    await page.goto(url)

    const goneAt = await veilGoneAt(page)
    expect(goneAt).toBeLessThanOrEqual(VEIL_MAX_HOLD_MS + ALLOWANCE_MS)
    expect(await counter(sw, page, "veil_abandoned")).toBeGreaterThanOrEqual(1)
    await page.close()
  })

  test("a parser blocked on a hanging script: the veil lifts within the bound while the document is still loading", async ({
    context,
  }) => {
    const url = "https://veil-fail-open.test/stalled.html"
    await serve(
      context,
      url,
      `<!doctype html><html><head><title>t</title></head><body><h1>Already parsed</h1><script src="https://veil-fail-open.test/hang.js"></script><p>after</p></body></html>`
    )
    let release: () => void = () => {}
    const hung = new Promise<void>((resolve) => {
      release = resolve
    })
    await context.route(
      "https://veil-fail-open.test/hang.js",
      async (route) => {
        await hung
        await route.fulfill({
          status: 200,
          contentType: "text/javascript",
          body: "",
        })
      }
    )

    const page = await context.newPage()
    await page.bringToFront()
    const navigation = page.goto(url, { waitUntil: "commit" })
    await navigation

    const goneAt = await veilGoneAt(page)
    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      heading: document.querySelector("h1")?.textContent ?? null,
    }))
    expect(state.readyState).toBe("loading")
    expect(state.heading).toBe("Already parsed")
    expect(goneAt).toBeGreaterThanOrEqual(VEIL_MAX_HOLD_MS - 50)
    expect(goneAt).toBeLessThanOrEqual(VEIL_MAX_HOLD_MS + ALLOWANCE_MS)

    release()
    await page.close()
  })
})

test.describe("the veil fails open without content.js", () => {
  test("a content script that throws on load: prepaint-start.js alone lifts the veil at the bound", async () => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    test.skip(executablePath === undefined, "needs the e2e Chromium")

    // A copy of the build whose content.js dies before doing anything.
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), "sw-filter-dead-"))
    fs.cpSync(DIST, broken, { recursive: true })
    fs.writeFileSync(
      path.join(broken, "content.js"),
      'throw new Error("content.js died on load")\n'
    )
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sw-filter-dead-profile-")
    )
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${broken}`,
        `--load-extension=${broken}`,
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
      ],
    })
    try {
      const url = "https://veil-fail-open.test/plain.html"
      await serve(
        context,
        url,
        `<!doctype html><html><head><title>t</title></head><body style="background:#fff"><p>plain</p></body></html>`
      )
      const page = await context.newPage()
      await page.bringToFront()
      await page.goto(url)

      // Up from document_start: the copy really does load prepaint-start.js.
      expect(
        await page.evaluate(
          (id) => document.getElementById(id) !== null,
          VEIL_ID
        )
      ).toBe(true)

      const goneAt = await veilGoneAt(page)
      expect(goneAt).toBeGreaterThanOrEqual(VEIL_MAX_HOLD_MS - 50)
      expect(goneAt).toBeLessThanOrEqual(VEIL_MAX_HOLD_MS + ALLOWANCE_MS)
      // content.js never ran: nothing set its markers.
      expect(
        await page.evaluate(() => document.body.dataset["swTabState"] ?? null)
      ).toBeNull()
    } finally {
      await context.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
      fs.rmSync(broken, { recursive: true, force: true })
    }
  })
})
