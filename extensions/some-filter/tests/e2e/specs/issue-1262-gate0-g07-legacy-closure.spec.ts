/**
 * #1262 Gate 0, G0.7 — does legacy mode's actual compositing closure cover
 * open shadow roots, nested shadow roots, and slotted content?
 *
 * Per docs/gate0/1262-falsification-report.md: do not assume the
 * document-level legacy `filter` (theme-apply.ts's `applyLegacyFilter`,
 * `html { filter: invert(...) ... } !important`) covers every relevant
 * composited pixel merely because it is declarative and page-wide. CSS
 * selectors do not cross a shadow boundary (confirmed structurally by G0.1);
 * a `filter` is a different mechanism — a compositing effect applied to an
 * element's whole rendered output — and this spec measures that directly.
 *
 * Two independent measurements, because they answer two different
 * questions and an early combined attempt conflated them (see git history —
 * comparing a shadow-hosted surface's composited color against a *sibling
 * light-DOM element* is not clean evidence: that sibling gets tagged
 * `data-sw-patched` by the unrelated auto-mode pipeline before this fixture
 * ever reaches legacy mode, and `applyState()`'s `restoreVendor()` does not
 * strip that per-element tag/dynamic stylesheet on the auto→legacy
 * transition — a real, but entirely out-of-#1262-scope, pre-existing
 * behavior that has nothing to do with shadow DOM):
 *
 *   G0.7a — the raw CSS primitive, no extension involved at all: does
 *   `filter` on `<html>` actually reach shadow-hosted and slotted content
 *   the same way it reaches ordinary light DOM? This is the platform
 *   question, decoupled from anything this extension does.
 *
 *   G0.7b — the real extension's legacy path: whatever the exact composited
 *   hue turns out to be, is a shadow-hosted native-white surface ever left
 *   at *native brightness* once legacy mode is active? This is the actual
 *   zero-leak safety question (Definition C.0) — not "does it match a
 *   sibling," which G0.7a already answers independently of any confound.
 */

import path from "path"
import { fileURLToPath } from "url"
import { test as filterTest } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"
import {
  brightestIn,
  DARK,
  type Region,
} from "@filter/playwright/fixtures/pixels"
import {
  chromium,
  expect,
  test as rawTest,
  type Browser,
} from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures")

/** Inset from each 100x100 box's edges — avoids antialiasing/subpixel filter-edge artifacts at the sampled boundary. */
function boxRegion(left: number): Region {
  return { x: left + 10, y: 10, width: 80, height: 80 }
}

rawTest.describe(
  "G0.7a — raw platform primitive: filter on <html> vs. the shadow boundary (no extension)",
  () => {
    let browser: Browser

    rawTest.beforeAll(async () => {
      const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      if (!executablePath) {
        throw new Error(
          "[FILTER][gate0] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set."
        )
      }
      const needsVirtualDisplay =
        !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]
      browser = await chromium.launch({
        executablePath,
        headless: false,
        args: needsVirtualDisplay ? ["--headless=new"] : [],
      })
    })

    rawTest.afterAll(async () => {
      await browser.close()
    })

    rawTest(
      "an html-level filter composites a flat shadow root, a doubly-nested shadow root, and slotted content identically to an ordinary light-DOM sibling",
      async () => {
        const context = await browser.newContext({
          viewport: { width: 480, height: 100 },
        })
        const page = await context.newPage()
        await page.goto(
          `file://${path.join(FIXTURE_DIR, "shadow-legacy-page.html")}`
        )
        // The exact filter string theme-apply.ts's buildFilterString() produces
        // for LEGACY_CONFIG — the platform primitive alone, none of the
        // extension's own canvas/floor/media/scrollbar rules (those are a
        // distinct, extension-specific question; see G0.7b's header for why
        // they must not be conflated with this one).
        await page.addStyleTag({
          content: `html { filter: invert(${LEGACY_CONFIG.invert}) hue-rotate(${LEGACY_CONFIG.hueRotate}deg) sepia(${LEGACY_CONFIG.sepia}) brightness(${LEGACY_CONFIG.brightness}) contrast(${LEGACY_CONFIG.contrast}) !important; }`,
        })
        await page.waitForTimeout(100)

        const light = await brightestIn(page, context, boxRegion(0))
        const shadowFlat = await brightestIn(page, context, boxRegion(120))
        const shadowNested = await brightestIn(page, context, boxRegion(240))
        const slotted = await brightestIn(page, context, boxRegion(360))

        expect(
          light.color,
          "sanity check: the filter must actually be doing something to the reference box"
        ).not.toEqual([255, 255, 255])

        expect(shadowFlat.color).toEqual(light.color)
        expect(shadowNested.color).toEqual(light.color)
        expect(slotted.color).toEqual(light.color)

        await context.close()
      }
    )
  }
)

filterTest.describe(
  "G0.7b — the real extension's legacy mode: is a shadow-hosted white surface ever left at native brightness?",
  () => {
    filterTest(
      "a flat shadow root, a nested shadow root, and slotted content are all dark once legacy mode is active — never raw native white",
      async ({ context, fixture }) => {
        const page = await fixture.goto("shadow-legacy-page")
        const sw = await backgroundWorker(context)
        await enterLegacyMode(sw, "shadow-legacy-page.html")

        await page.waitForFunction(
          () => document.documentElement.hasAttribute("data-sw-legacy"),
          undefined,
          { timeout: 5_000, polling: 100 }
        )
        await page.waitForTimeout(300)

        // #slotted-content is genuine light DOM (a real child of #slot-host,
        // merely *rendered* elsewhere via <slot>) — unlike the shadow-flat/
        // shadow-nested boxes, it is reachable by auto mode's scan() and gets
        // tagged data-sw-patched (with an active rule in the dynamic
        // stylesheet) during this fixture's initial auto-mode pass, before
        // enterLegacyMode() ever runs. applyState()'s restoreVendor() does not
        // strip that per-element tag/rule on the auto→legacy transition — a
        // real, reproducible behavior, but of restoreVendor(), not of the
        // legacy filter's shadow-DOM closure this spec exists to test, and
        // entirely unrelated to #1262 (out of scope here; worth its own
        // report to the maintainers, separately). Stripping it directly is
        // the correct control for *this* measurement, the same way G0.7a
        // isolates the platform primitive from this same extension by not
        // loading the extension at all.
        await page.evaluate(() => {
          document
            .getElementById("slotted-content")
            ?.removeAttribute("data-sw-patched")
        })

        const shadowFlat = await brightestIn(page, context, boxRegion(120))
        const shadowNested = await brightestIn(page, context, boxRegion(240))
        const slotted = await brightestIn(page, context, boxRegion(360))

        for (const [label, sample] of [
          ["shadow-flat", shadowFlat],
          ["shadow-nested", shadowNested],
          ["slotted", slotted],
        ] as const) {
          expect(
            sample.color,
            `${label}: legacy mode must never leave a shadow-hosted native-white surface at native brightness`
          ).not.toEqual([255, 255, 255])
          expect(
            sample.luminance,
            `${label}: composited luminance should read as dark once legacy is active`
          ).toBeLessThanOrEqual(DARK)
        }
      }
    )
  }
)
