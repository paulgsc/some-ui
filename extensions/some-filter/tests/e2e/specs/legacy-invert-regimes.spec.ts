/**
 * Pixel-level proof that legacy invert mode paints a dark surface where the
 * root filter actually reaches, and a documented account of the one place
 * a screenshot from this specific (headless/swiftshader) harness turned out
 * not to be trustworthy.
 *
 * Every other test in this repo reasons about *declared* values, because
 * that is all `getComputedStyle` can see — it never reflects `filter`
 * compositing (issue-741-auto-defects.spec.ts makes the same point). That
 * blind spot is precisely where the canvas and scrollbar bugs below lived:
 * a surface declared white is dark only if something actually filters it.
 *
 *   #1175 — the propagated <html> canvas was repolarised to white on the
 *           strength of composited maths that were correct but described
 *           the wrong consumer. Raw ticks (vendor content materialised
 *           after document_end and revealed faster than it rasters, e.g. a
 *           held PgDn on GitHub) are filled with the canvas colour
 *           unfiltered, so white was a full-viewport flash.
 *   scrollbar — browser chrome, painted outside the root filter's render
 *           surface unconditionally (verified by pixel probe: a scrollbar
 *           declared green/red under this preset renders green/red, not
 *           the inverted cyan/magenta) — so it must simply be dark, no
 *           trade-off to weigh.
 *
 * The veil test below is the odd one out, and deliberately asserts less
 * than the other two: an earlier version gave the veil's top-layer
 * (`:popover-open`) rule a dark value on the theory that a top-layer
 * element is outside every ancestor filter's render surface. That theory
 * matched this harness's own pixel measurement and did NOT match real
 * usage — it caused a real refresh/remount flash that reverting the value
 * back to white removed. So for this one case, this harness's pixels are
 * a demonstrated false witness, and the veil test only checks what's
 * actually settled: the declared value, not what this sandbox renders it
 * as. See prepaint.css's own header comment for the full account.
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

  test("the root scrollbar reads dark, not the browser's native chrome colour", async ({
    context,
    fixture,
  }) => {
    // The scrollbar gutter is exactly what contentWidth() excludes from
    // every other test in this file — it is browser chrome, painted outside
    // the root filter's render surface, so nothing here composites it. This
    // test samples that excluded strip on purpose, instead of avoiding it.
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
    // Driven directly rather than through the pipeline: the real veil is torn
    // down two rAFs after it goes up, which is a race no screenshot can win
    // reliably. The artifact under test is prepaint.css, so this builds the
    // exact scene it is written for — real file, real filter, real popover
    // promotion.
    //
    // The fallback (non-promoted) case is asserted on rendered pixels: white,
    // filtered, is unambiguous — it composites dark everywhere, sandbox or
    // real hardware, no disagreement on record.
    //
    // The top-layer case is asserted on the *declared* value only, not on
    // rendered pixels. It used to be pixel-checked here too, expecting dark,
    // back when prepaint.css gave `:popover-open` its own dark value. That
    // value produced a real refresh/remount white flash in actual use; only
    // this project's own headless/swiftshader harness ever measured it as
    // dark. Reverting it to white (this file's header comment has the full
    // account) fixed the real flash, but it also means a pixel assertion of
    // "renders dark" here would be asserting this sandbox's own outlier
    // behaviour rather than the real-world-verified one — so this checks
    // what the CSS declares, which is what changed and what future edits
    // should be caught touching, not what one specific renderer does with it.
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
      // Top layer: a *separate* scene, not the fallback one with its popover
      // later closed — a closed [popover] element is display:none by the UA
      // stylesheet, not "a plain fixed div", so that approach would sample
      // whatever is behind it (the canvas) instead of the veil.
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

      // Fallback: no popover attribute at all, so it's an ordinary fixed div,
      // visible by default — the same shape the real fallback (popover
      // unsupported, or showPopover() refused) actually takes.
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
    // Reproduces the reported flash directly: a vendor SPA router (YouTube's
    // Polymer router, dispatching yt-navigate-start/finish) can wholesale-
    // replace <head> mid-navigation. data-sw-legacy lives on <html> and
    // survives that; #__sw_legacy_filter — the <style> carrying the actual
    // `filter: invert(...)` — used to be a <head> child and did not.
    // prepaint.css's veil rule is gated purely on data-sw-legacy, on the
    // premise that the same still-active root filter will invert its
    // declared white back to dark; losing the filter while the attribute
    // survives falsifies that premise. theme-apply.ts's applyLegacyFilter
    // now anchors the <style> on <html> itself instead (this file's sibling
    // test above already proves the *filter* composites correctly once
    // installed — this proves the specific split-brain window is closed).
    //
    // Fallback (non-popover) rendering path only, same reasoning as the
    // sibling test above: the top-layer path is where this project's own
    // headless/swiftshader harness is a documented false witness (prepaint
    // .css's header comment), so yt-navigate-repaint.spec.ts's real,
    // extension-driven scene deliberately does not pixel-check it. This
    // scene isolates the one variable that mechanism actually depends on —
    // whether the filter <style> is present — with everything else (the
    // shipped prepaint.css, the real filter string, an un-promoted veil)
    // identical between the two samples below.
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

      // The fix: the filter <style> survives (anchored on <html>, so a
      // <head>-only swap can't take it) — the same declared-white veil now
      // composites dark, same as the settled state always has.
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
