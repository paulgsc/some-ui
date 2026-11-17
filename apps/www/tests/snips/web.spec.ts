/**
 * The web surface's snips (SNIPS1, `docs/snips.md`): every route the Pages
 * build offers, at each of `WEB_VIEWPORTS`, on the viewer's sample data, the
 * clock frozen at `FROZEN_AT` and motion reduced.
 *
 * Run by `.github/workflows/snips-capture.yml` only: it skips unless
 * `SNIPS_OUT` names where the bundle's web half goes, and needs the Pages
 * build in `WWW_DIST_PAGES` (as `tests/local-mode` does).
 *
 * No owner data can reach a picture: the build is the viewer's
 * (`VITE_STATIC_DATA`, so it reads only its bundled samples), each size
 * starts in a fresh browser context with nothing stored, and every request
 * that leaves the page's own origin is refused and fails the capture.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import type { BrowserContext } from "@playwright/test"
import { builtApp, serveBuild } from "@tests/local-mode/harness"
import type { Listening } from "@tests/local-mode/harness"

import {
  appVersionOf,
  FROZEN_AT,
  parseRouteTree,
  routesFor,
  WEB_VIEWPORTS,
} from "@/lib/snips"

import { walk, writePart } from "./capture"

const OUT = process.env["SNIPS_OUT"]
/** The Pages build's base path, as pages.yml and pr.yml build it. */
const BASE = "/some-ui/"
const WWW = join(import.meta.dirname, "../..")

test.describe("snips: web", () => {
  test.skip(!OUT, "SNIPS_OUT is not set: run by snips-capture.yml")
  test.setTimeout(30 * 60_000)

  let site: Listening | null = null
  test.beforeAll(async () => {
    const built = builtApp("pages")
    if ("why" in built) throw new Error(built.why)
    site = await serveBuild(built.dir, BASE)
  })
  test.afterAll(async () => {
    await site?.close()
  })

  test("every route the Pages build offers, at each size", async ({
    browser,
  }) => {
    const appVersion = appVersionOf(
      readFileSync(join(WWW, "package.json"), "utf8")
    )
    const routes = routesFor(
      "web",
      parseRouteTree(readFileSync(join(WWW, "src/routeTree.gen.ts"), "utf8"))
    )
    const origin = site!.origin
    const base = `${origin}${BASE.replace(/\/$/, "")}`
    const parts = []
    for (const viewport of WEB_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.scale,
        isMobile: viewport.name === "phone",
        hasTouch: viewport.name === "phone",
        reducedMotion: "reduce",
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "light",
      })
      const leaked: Array<string> = []
      await hold(context, origin, leaked)
      const page = await context.newPage()
      const part = await walk({
        surface: "web",
        build: "release",
        page,
        viewport,
        appVersion,
        routes,
        out: OUT!,
        base,
        open: async (path) => {
          await page.goto(`${base}${path}`)
        },
        camera: {
          shoot: () =>
            page.screenshot({ animations: "disabled", caret: "hide" }),
          // A browser's video is all or nothing per context; a still that
          // moved gets a second look in a context that records.
          record: async () => {
            const recorder = await browser.newContext({
              viewport: { width: viewport.width, height: viewport.height },
              reducedMotion: "reduce",
              recordVideo: {
                dir: join(OUT!, ".video"),
                size: { width: viewport.width, height: viewport.height },
              },
            })
            await hold(recorder, origin, leaked)
            const shown = await recorder.newPage()
            await shown.goto(page.url())
            await shown.waitForTimeout(4_000)
            await recorder.close()
            const video = shown.video()
            if (!video) return null
            return { bytes: readFileSync(await video.path()), kind: "webm" }
          },
        },
      })
      expect(leaked, "nothing left the page's own origin").toEqual([])
      await context.close()
      parts.push(part)
    }
    writePart(
      OUT!,
      {
        surface: "web",
        appVersion,
        snips: parts.flatMap((p) => p.snips),
        unreached: parts.flatMap((p) => p.unreached),
      },
      "web"
    )
  })
})

/**
 * Freezes a context's clock and refuses every request off the page's own
 * origin, noting each in `leaked`, which the capture fails on.
 */
async function hold(
  context: BrowserContext,
  origin: string,
  leaked: Array<string>
): Promise<void> {
  await context.clock.setFixedTime(new Date(FROZEN_AT))
  await context.route("**/*", async (route) => {
    const url = route.request().url()
    // The browser's own pages (its PDF viewer, for the résumé) are not the
    // network.
    if (
      url.startsWith(origin) ||
      /^(data|blob|chrome|chrome-extension):/.test(url)
    ) {
      await route.continue()
      return
    }
    leaked.push(url)
    await route.abort()
  })
}
