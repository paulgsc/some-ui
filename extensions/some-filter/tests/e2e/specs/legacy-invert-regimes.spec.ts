/**
 * Pixel-level proof that legacy invert mode paints a dark surface where the
 * root filter actually reaches, and the one place this headless harness's
 * screenshots are not trustworthy.
 *
 * `getComputedStyle` never reflects `filter` compositing, which is where the
 * canvas and scrollbar bugs lived: a surface declared white is dark only if
 * something actually filters it.
 *
 *   #1175 — raw ticks (content revealed faster than it rasters, e.g. a held
 *           PgDn on GitHub) are filled with the canvas colour unfiltered, so
 *           a white <html> canvas was a full-viewport flash.
 *   scrollbar — browser chrome, painted outside the root filter's render
 *           surface (verified by pixel probe), so it must simply be dark.
 *
 * The veil test asserts less: a dark top-layer veil matched this harness's
 * pixels but caused a real refresh flash, so here the harness is a false
 * witness and only the declared value is checked (prepaint.css's header).
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
    // transparent-page declares no background, so the viewport below its
    // content is exactly the pair under test: the canvas and the floor.
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

  test("the root scrollbar reads dark, not the browser's native chrome colour", async ({
    context,
    fixture,
  }) => {
    // Samples the scrollbar gutter that contentWidth() excludes elsewhere:
    // browser chrome, outside the root filter's render surface.
    const page = await fixture.goto("transparent-page")
    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "transparent-page.html", LEGACY_CONFIG)

    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    // transparent-page is short; force a gutter regardless of content
    // height rather than depending on the fixture happening to overflow.
    await page.evaluate(() => {
      document.documentElement.style.overflowY = "scroll"
    })

    const viewport = page.viewportSize()
    if (viewport === null) throw new Error("no viewport")
    const gutterWidth = viewport.width - (await contentWidth(page))
    expect(
      gutterWidth,
      "overflow-y: scroll must produce a gutter to sample"
    ).toBeGreaterThan(0)

    const { color, luminance: lum } = await brightestIn(page, context, {
      x: viewport.width - gutterWidth,
      y: 0,
      width: gutterWidth,
      height: viewport.height,
    })

    expect(
      lum,
      `brightest scrollbar-gutter pixel was ${describeColor(color)} — legacy ` +
        `invert must not leave the browser's native (light) scrollbar showing`
    ).toBeLessThan(DARK)
  })

  test("the shipped veil CSS declares white for both the fallback and the top layer", async ({
    context,
  }) => {
    // Driven directly: the real veil comes down two rAFs after it goes up, a
    // race no screenshot wins. This builds the scene prepaint.css is written
    // for — real file, real filter, real popover promotion.
    //
    // The fallback case is asserted on pixels (white, filtered, composites
    // dark everywhere). The top-layer case is asserted on the *declared*
    // value only: this harness renders it differently from real hardware
    // (see the header), so a pixel check would pin the outlier.
    const prepaintCss = fs.readFileSync(PREPAINT_CSS, "utf8")
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })
    const sceneHtml = (withPopoverAttr: boolean): string =>
      `<!doctype html>
       <html data-sw-legacy class="sw-dirty">
         <head><style>${prepaintCss}</style>
         <style>
           html { filter: ${FILTER_STRING} !important;
                  background-color: #0d1117 !important; }
           body { margin: 0; height: 100%; background: #fff; }
         </style></head>
         <body><div id="__sw_prepaint_veil" data-my-ext
                    ${withPopoverAttr ? 'popover="manual"' : ""}></div></body>
       </html>`

    try {
      // Top layer: a *separate* scene — a closed [popover] is display:none,
      // so closing this one would sample the canvas instead of the veil.
      await scene.setContent(sceneHtml(true))
      const declaredTopLayer = await scene.evaluate(() => {
        const veil = document.getElementById("__sw_prepaint_veil")
        if (veil === null) throw new Error("veil missing")
        veil.showPopover()
        if (!veil.matches(":popover-open")) {
          throw new Error("veil did not reach the top layer")
        }
        return getComputedStyle(veil).backgroundColor
      })
      expect(
        declaredTopLayer,
        "the top-layer rule must declare the same white the fallback rule does"
      ).toBe("rgb(255, 255, 255)")

      // Fallback: no popover attribute, an ordinary fixed div, as when
      // popovers are unsupported or showPopover() is refused.
      await scene.setContent(sceneHtml(false))
      const { color, luminance: lum } = await brightestIn(scene, context, {
        x: 0,
        y: 0,
        width: await contentWidth(scene),
        height: 300,
      })
      expect(
        lum,
        `veil in the fixed/z-index fallback rendered ${describeColor(color)} ` +
          `— filtered and white must composite dark`
      ).toBeLessThan(DARK)
    } finally {
      await scene.close()
    }
  })

  test("the veil's declared white composites dark only once the legacy filter <style> is back — the yt-navigate <head>-swap flash, pixel-side-by-side", async ({
    context,
  }) => {
    // Reproduces the reported flash: a router replacing <head> mid-navigation
    // keeps data-sw-legacy (on <html>) but would take a <head>-anchored
    // filter <style>, leaving the declared-white veil uninverted. The <style>
    // is anchored on <html>; this proves that split window is closed.
    //
    // Fallback rendering path only (the harness is a false witness for the
    // top layer). The two samples differ only in whether the filter <style>
    // is present.
    const prepaintCss = fs.readFileSync(PREPAINT_CSS, "utf8")
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })

    const sceneHtml = (filterStylePresent: boolean): string =>
      `<!doctype html>
       <html data-sw-legacy class="sw-dirty" style="background-color: rgb(255, 255, 255)">
         <head><style>${prepaintCss}</style>
         ${
           filterStylePresent
             ? `<style id="__sw_legacy_filter">
                  html { filter: ${FILTER_STRING} !important; background-color: #0d1117 !important; }
                </style>`
             : ""
         }
         </head>
         <body><div id="__sw_prepaint_veil" data-my-ext></div></body>
       </html>`

    try {
      // The split-brain window itself: data-sw-legacy present, the filter
      // <style> carried off by the <head> swap — the literal flash.
      await scene.setContent(sceneHtml(false))
      const flashed = await brightestIn(scene, context, {
        x: 0,
        y: 0,
        width: await contentWidth(scene),
        height: 300,
      })
      expect(
        flashed.luminance,
        `veil with the filter <style> missing rendered ${describeColor(flashed.color)} ` +
          `— this is the literal flash the bug produced`
      ).toBeGreaterThan(1 - DARK)

      // The fix: the filter <style> survives, so the white veil composites
      // dark.
      await scene.setContent(sceneHtml(true))
      const fixed = await brightestIn(scene, context, {
        x: 0,
        y: 0,
        width: await contentWidth(scene),
        height: 300,
      })
      expect(
        fixed.luminance,
        `veil with the filter <style> present rendered ${describeColor(fixed.color)} ` +
          `— declared white must composite dark once something actually inverts it`
      ).toBeLessThan(DARK)
    } finally {
      await scene.close()
    }
  })
})
