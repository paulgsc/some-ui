/**
 * Pixel-level proof that legacy invert mode paints a dark surface in *both*
 * of the regimes its colours are consumed in.
 *
 * Every other test in this repo reasons about *declared* values, because
 * that is all `getComputedStyle` can see — it never reflects `filter`
 * compositing (issue-741-auto-defects.spec.ts makes the same point). That
 * blind spot is precisely where this bug class lives: a surface declared
 * white is dark only if something actually filters it, and twice now
 * something did not.
 *
 *   #1175 — the propagated <html> canvas was repolarised to white on the
 *           strength of composited maths that were correct but described
 *           the wrong consumer. Raw ticks (vendor content materialised
 *           after document_end and revealed faster than it rasters, e.g. a
 *           held PgDn on GitHub) are filled with the canvas colour
 *           unfiltered, so white was a full-viewport flash.
 *   veil   — the prepaint veil is promoted to the top layer via the popover
 *           API, and a top-layer element is painted outside every ancestor
 *           filter's render surface. Declared white "so the inversion turns
 *           it black", it was simply white.
 *
 * Only a screenshot can tell those apart from the correct case, so this
 * spec asserts on real pixels.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { expect, test } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"
import {
  brightestIn,
  contentWidth,
  DARK,
  describeColor,
} from "@filter/playwright/fixtures/pixels"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** The built artifact the extension actually ships, not the source copy. */
const PREPAINT_CSS = path.resolve(__dirname, "../../../dist/prepaint.css")

const FILTER_STRING = [
  `invert(${LEGACY_CONFIG.invert})`,
  `hue-rotate(${LEGACY_CONFIG.hueRotate}deg)`,
  `sepia(${LEGACY_CONFIG.sepia})`,
  `brightness(${LEGACY_CONFIG.brightness})`,
  `contrast(${LEGACY_CONFIG.contrast})`,
].join(" ")

test.describe("legacy invert mode, in both rendering regimes", () => {
  test("the settled page has no light surface where the vendor paints nothing", async ({
    context,
    fixture,
  }) => {
    // transparent-page declares no background anywhere, so what fills the
    // viewport below its content is exactly the pair under test: the
    // propagated canvas, and the floor behind it.
    const page = await fixture.goto("transparent-page")
    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "transparent-page.html", LEGACY_CONFIG)

    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    // Let the veil commit and come down, so what is sampled is the settled
    // state rather than the veil that covers it.
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const viewport = page.viewportSize()
    if (viewport === null) throw new Error("no viewport")
    // The lower half: below the fixture's heading and paragraph, so no
    // inverted (and legitimately light) glyphs are in frame.
    const { color, luminance: lum } = await brightestIn(page, context, {
      x: 0,
      y: Math.floor(viewport.height * 0.55),
      width: await contentWidth(page),
      height: Math.floor(viewport.height * 0.4),
    })

    expect(
      lum,
      `brightest empty-region pixel was ${describeColor(color)} — legacy ` +
        `invert must leave a dark surface where the page paints nothing`
    ).toBeLessThan(DARK)
  })

  test("the shipped veil CSS is dark in the top layer and in the fallback alike", async ({
    context,
  }) => {
    // Driven directly rather than through the pipeline: the real veil is torn
    // down two rAFs after it goes up, which is a race no screenshot can win
    // reliably. The artifact under test is prepaint.css, so this builds the
    // exact scene it is written for — real file, real filter, real popover
    // promotion — and reads the pixels it produces.
    const prepaintCss = fs.readFileSync(PREPAINT_CSS, "utf8")
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })

    try {
      for (const promote of [true, false]) {
        await scene.setContent(
          `<!doctype html>
           <html data-sw-legacy class="sw-dirty">
             <head><style>${prepaintCss}</style>
             <style>
               html { filter: ${FILTER_STRING} !important;
                      background-color: #0d1117 !important; }
               body { margin: 0; height: 100%; background: #fff; }
             </style></head>
             <body><div id="__sw_prepaint_veil" data-my-ext
                        ${promote ? 'popover="manual"' : ""}></div></body>
           </html>`
        )
        if (promote) {
          await scene.evaluate(() => {
            const veil = document.getElementById("__sw_prepaint_veil")
            if (veil === null) throw new Error("veil missing")
            veil.showPopover()
            // If promotion is unavailable the fallback iteration already
            // covers that path — here it must actually happen, or the regime
            // this case exists to test is not the one being tested.
            if (!veil.matches(":popover-open")) {
              throw new Error("veil did not reach the top layer")
            }
          })
        }

        const { color, luminance: lum } = await brightestIn(scene, context, {
          x: 0,
          y: 0,
          width: await contentWidth(scene),
          height: 300,
        })

        expect(
          lum,
          `veil ${promote ? "in the top layer" : "in the fixed/z-index fallback"} ` +
            `rendered ${describeColor(color)} — it must read dark in both ` +
            `regimes, and only one of them is reached by the root filter`
        ).toBeLessThan(DARK)
      }
    } finally {
      await scene.close()
    }
  })
})
