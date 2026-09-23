/**
 * A yt-navigate-* route swap must not hand a themed page back to native
 * rendering just because the surfaces keeping it light are ones this
 * extension already themed.
 *
 * Reported live on YouTube (watch -> watch inside a Mix playlist): the veil
 * covered the navigation, then lifted onto the *native light* page, which
 * stayed white for ~3.6 s before a later reactive round re-themed it — a
 * full-screen flashbang on a page the extension had been theming a moment
 * earlier.
 *
 * Mechanism (pipeline.ts): `yt-navigate-finish` bumps the content epoch, and
 * the next `ingest()` drops every hypothesis key (`dropStaleEvidence`) so
 * keys the new route no longer carries stop voting. But `scan()` skips every
 * element already tagged `data-sw-patched` (`shouldSkip`), and YouTube keeps
 * its app shell — the big light surfaces the first round tagged — across a
 * route swap. Those keys were dropped and could not be re-learned, so the
 * post-navigation verdict was decided by whatever *untagged* evidence was
 * left: mid-grey controls. Their mean reads as already dark, `decide()`
 * emits `restore-native`, and `document-scope.ts` exonerates the page and
 * releases the veil onto native white.
 *
 * yt-spa-shell-page.html is that shape with no YouTube in it; its own
 * header lists which elements play which part.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Matches yt-navigate-repaint.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3). */
const THEMED_LUMINANCE_CEILING = 0.3

type FrameRecord = {
  readonly veil: boolean
  readonly darkAttr: boolean
  readonly mastheadBg: string
}

test.describe("auto mode keeps a themed shell themed across a yt-navigate-* route swap", () => {
  test("no frame between yt-navigate-start and settle shows the persistent light shell natively", async ({
    fixture,
  }) => {
    const page = await fixture.goto("yt-spa-shell-page")
    const initial = await waitForClassification(page)
    expect(initial.themeApplied).toBe("dark")
    expect(initial.hasPrepaintVeil).toBe(false)

    const shellTagged = await page.evaluate(() =>
      ["masthead", "guide", "watch"].every(
        (id) => document.getElementById(id)?.dataset["swPatched"] !== undefined
      )
    )
    expect(
      shellTagged,
      "precondition: the first round tagged every persistent light shell surface"
    ).toBe(true)

    // One page.evaluate() drives the whole navigation and samples every
    // animation frame through it, so what is recorded is what each frame
    // would paint (computed style + veil presence at rAF time), not what a
    // poll from the test process happened to land on.
    const frames = await page.evaluate(async () => {
      const records: Array<FrameRecord> = []
      let sampling = true
      const masthead = document.getElementById("masthead")
      if (masthead === null) throw new Error("fixture: #masthead missing")
      const sample = (): void => {
        records.push({
          veil: document.getElementById("__sw_prepaint_veil") !== null,
          darkAttr: document.documentElement.hasAttribute("data-sw-dark"),
          mastheadBg: getComputedStyle(masthead).backgroundColor,
        })
        if (sampling) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)

      const wait = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms))

      window.dispatchEvent(new Event("yt-navigate-start"))
      await wait(100)
      // The router swaps the route-specific controls under the player for
      // new ones with different colours; the shell and the player survive.
      const route = document.getElementById("route")
      if (route === null) throw new Error("fixture: #route missing")
      route.innerHTML =
        '<div style="background-color: rgb(85, 85, 85); padding: 4px">d</div>' +
        '<div style="background-color: rgb(100, 100, 100); padding: 4px">e</div>' +
        '<div style="background-color: rgb(118, 118, 118); padding: 4px">f</div>'
      await wait(200)
      window.dispatchEvent(new Event("yt-navigate-finish"))
      // Past the commit's 2×rAF/COMMIT_FALLBACK_MS gate and several of the
      // pipeline's own 50 ms debounced rounds.
      await wait(1_000)
      sampling = false
      return records
    })

    expect(frames.length).toBeGreaterThan(10)

    const leaks = frames.flatMap((frame, index) => {
      if (frame.veil) return []
      const rgba = parseColor(frame.mastheadBg)
      if (rgba === null) return [{ index, frame, luminance: Number.NaN }]
      const luminance = relativeLuminance(rgba[0], rgba[1], rgba[2])
      return luminance >= THEMED_LUMINANCE_CEILING
        ? [{ index, frame, luminance }]
        : []
    })
    expect(
      leaks,
      `${String(leaks.length)} of ${String(frames.length)} frames showed the ` +
        `persistent shell unveiled and native-bright; first: ${JSON.stringify(leaks[0])}`
    ).toEqual([])

    const settled = await page.evaluate(() => ({
      themeApplied: document.body.dataset["swThemeApplied"],
      darkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      veil: document.getElementById("__sw_prepaint_veil") !== null,
    }))
    expect(settled).toEqual({
      themeApplied: "dark",
      darkAttr: true,
      veil: false,
    })
  })
})
