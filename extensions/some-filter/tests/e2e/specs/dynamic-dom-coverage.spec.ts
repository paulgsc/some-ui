/**
 * Exogenous-DOM coverage, proven against the real `--load-extension` build.
 *
 * Three mechanisms, one premise: the extension's error is asymmetric, so a
 * surface may be darkened before anything has read it, and the round is
 * what *corrects* that rather than what rescues it.
 *
 *   - `provisional.ts` marks each inserted subtree root; the static layer
 *     fills it dark until a round hands over.
 *   - the static layer's ARIA popup rule covers a popup whose colour no
 *     round has ever committed.
 *   - the static layer's interaction rule cancels a vendor `:hover`
 *     background the Sensor structurally cannot observe.
 *
 * The unit suites pin the logic. None of them can pin what matters here:
 * jsdom applies no stylesheet rule to `getComputedStyle`, has no rendering
 * steps, and has no `requestAnimationFrame` tied to a real frame — and two
 * of the three mechanisms above are pure CSS, so in jsdom they do not exist
 * at all.
 *
 * Measurement: read the element inside the first `requestAnimationFrame`
 * after the change. A rAF callback runs during that frame's rendering
 * steps, before paint, so what it reads is what the frame is about to show
 * — not what settled some milliseconds later. Every assertion here is
 * anchored to that, because "before the first paint" is the entire claim.
 *
 * SF4 (#1360) classification: visual-claim, justified — the claims are
 * about colour resolution, which computed style reflects directly, with no
 * `filter` compositing involved.
 *
 * Which of these regression-lock the change, measured by building with all
 * three mechanisms disabled and re-running. 5 of 7 fail in that control:
 *
 *   FAIL  route subtree paints dark in the first frame
 *   FAIL  hover-built popup is dark in the first frame
 *   FAIL  popup descendants covered from one mark on the root
 *   FAIL  role=menu popup in an uncommitted colour
 *   FAIL  vendor :hover cancelled rather than painted white
 *
 *   pass  "hands over to the round" — and is meant to. With no marks ever
 *         written, "nothing is still provisional" is vacuously true; what
 *         it pins is that the fill is *temporary*, a contract an
 *         implementation that never lifted a mark would break while this
 *         control build does not.
 *   pass  "does not blank every ancestor up to body" — and is meant to. It
 *         guards the interaction rule against being too aggressive, so it
 *         passing without that rule present is exactly right; it fails
 *         against a version of the rule that drops `:not(:has(:hover))`,
 *         which is the build it exists to catch.
 *
 * Recorded because a spec whose every test passes against the unpatched
 * build proves nothing, and the only way to know which is which is to have
 * run it that way.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

/** The vendor colour of the pre-existing card and the hover-built popup. */
const VENDOR_SURFACE = "rgb(238, 238, 238)"
/** The vendor's `:hover` colour — the github.com/…/issues value, measured. */
const VENDOR_HOVER = "rgb(234, 236, 237)"

/** Luminance on the same scale `color.ts` uses, for "is this dark" claims. */
function luminanceOf(css: string): number {
  const m = css.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
  if (m === null) throw new Error(`unparseable colour: ${css}`)
  const [, r, g, b] = m
  return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)
}

/** Mid-grey. Anything below is dark enough that the asymmetry is satisfied. */
const DARK_ENOUGH = 128

async function firstFrameBackground(
  page: Page,
  mutate: string,
  selector: string
): Promise<{ firstFrame: string; settled: string }> {
  return page.evaluate(
    async ([mutateSrc, sel]) =>
      new Promise<{ firstFrame: string; settled: string }>((resolve) => {
        // eslint-disable-next-line no-new-func
        new Function(mutateSrc)()
        requestAnimationFrame(() => {
          const el = document.querySelector(sel)
          if (el === null) throw new Error(`missing: ${sel}`)
          const firstFrame = getComputedStyle(el).backgroundColor
          // Well past RECONCILE_POLICY's debounce plus a round.
          setTimeout(() => {
            const after = document.querySelector(sel)
            resolve({
              firstFrame,
              settled:
                after === null ? "" : getComputedStyle(after).backgroundColor,
            })
          }, 700)
        })
      }),
    [mutate, selector] as const
  )
}

test.describe("a route-sized subtree the vendor inserts", () => {
  // The github.com case, reduced: 300 surfaces arriving at once. The
  // previous, read-based design bound 31 of them in the first frame and
  // left 269 painting light for 1167ms.
  const insertRoute = `
    const root = document.createElement("div")
    root.id = "route"
    for (let i = 0; i < 300; i += 1) {
      const wrap = document.createElement("div")
      const card = document.createElement("div")
      card.className = "route-surface"
      card.style.backgroundColor = i % 2 ? "rgb(238,238,238)" : "rgb(250,250,250)"
      card.textContent = "row " + i
      wrap.appendChild(card)
      root.appendChild(wrap)
    }
    document.body.appendChild(root)
  `

  test("paints dark in the first frame, all of it, regardless of size", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    expect((await waitForClassification(page)).themeApplied).toBe("dark")

    await firstFrameBackground(page, insertRoute, ".route-surface")

    const worst = await page.evaluate(() => {
      // Re-run the insertion and measure *every* surface in the first
      // frame, not a sample: the defect this replaces was specifically
      // partial coverage, so an assertion on one element would have passed
      // against the design that failed.
      const root = document.getElementById("route")
      root?.remove()
      return new Promise<{ count: number; maxLuminance: number }>((resolve) => {
        const host = document.createElement("div")
        host.id = "route"
        for (let i = 0; i < 300; i += 1) {
          const wrap = document.createElement("div")
          const card = document.createElement("div")
          card.className = "route-surface"
          card.style.backgroundColor =
            i % 2 ? "rgb(238,238,238)" : "rgb(250,250,250)"
          wrap.appendChild(card)
          host.appendChild(wrap)
        }
        document.body.appendChild(host)
        requestAnimationFrame(() => {
          const all = [...document.querySelectorAll(".route-surface")]
          let max = 0
          for (const el of all) {
            const css = getComputedStyle(el).backgroundColor
            const m = css.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
            if (m === null) continue
            const l =
              0.2126 * Number(m[1]) +
              0.7152 * Number(m[2]) +
              0.0722 * Number(m[3])
            if (l > max) max = l
          }
          resolve({ count: all.length, maxLuminance: max })
        })
      })
    })

    expect(worst.count).toBe(300)
    // The brightest surface in the whole inserted subtree, in the frame it
    // first paints in.
    expect(worst.maxLuminance).toBeLessThan(DARK_ENOUGH)
  })

  test("hands over to the round rather than staying provisionally dark", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    await firstFrameBackground(page, insertRoute, ".route-surface")

    const state = await page.evaluate(() => {
      const el = document.querySelector(".route-surface")
      return {
        stillProvisional: document.querySelectorAll("[data-sw-provisional]")
          .length,
        tagged: el?.getAttribute("data-sw-patched") ?? null,
      }
    })

    // The fill is a stand-in for an opinion, not a substitute for one: once
    // the round has classified the subtree the mark is lifted and the
    // Actuator's own hue-preserving colour is what remains.
    expect(state.stillProvisional).toBe(0)
    expect(state.tagged).not.toBeNull()
  })
})

test.describe("a popup the vendor creates on hover", () => {
  test("is dark in the first frame it can paint in", async ({ fixture }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    const sample = await firstFrameBackground(
      page,
      `document.getElementById("trigger").dispatchEvent(
         new PointerEvent("pointerover", { bubbles: true }))`,
      "#popup"
    )

    expect(sample.firstFrame).not.toBe(VENDOR_SURFACE)
    expect(luminanceOf(sample.firstFrame)).toBeLessThan(DARK_ENOUGH)
  })

  test("covers the popup's descendants too, from one mark on its root", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    const sample = await firstFrameBackground(
      page,
      `document.getElementById("trigger").dispatchEvent(
         new PointerEvent("pointerover", { bubbles: true }))`,
      ".vendor-popup-item"
    )

    // A popper's carriers are its descendants far more often than its root,
    // and only the root is ever marked — this is the descendant combinator
    // in the CSS rule doing the work the JS deliberately does not.
    expect(luminanceOf(sample.firstFrame)).toBeLessThan(DARK_ENOUGH)
  })

  test("themes a role=menu popup in a colour no round has ever committed", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    const sample = await firstFrameBackground(
      page,
      `const m = document.createElement("div")
       m.id = "aria-menu"
       m.setAttribute("role", "menu")
       m.style.backgroundColor = "rgb(252, 249, 240)"
       document.body.appendChild(m)`,
      "#aria-menu"
    )

    expect(sample.firstFrame).not.toBe("rgb(252, 249, 240)")
    expect(luminanceOf(sample.firstFrame)).toBeLessThan(DARK_ENOUGH)
  })
})

test.describe("a vendor :hover background on an untagged row", () => {
  /**
   * The dominant defect in the real recording — 12.5% of a 54s clip on
   * github.com/…/issues, in episodes of 0.7-2.4s. Not a flash: a steady
   * state lasting exactly as long as the pointer rested.
   *
   * `page.hover()` rather than a synthetic event, deliberately. A
   * dispatched `PointerEvent` does not make `:hover` match — only real
   * pointer position does — so a synthetic-event version of this test
   * would measure nothing and pass against any build.
   */
  test("is cancelled, not painted white", async ({ fixture }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)
    await page.waitForTimeout(700)

    await page.hover("#row-a")

    const hovered = await page.evaluate(() => {
      const el = document.getElementById("row-a")
      if (el === null) throw new Error("row missing")
      return {
        background: getComputedStyle(el).backgroundColor,
        matchesHover: el.matches(":hover"),
        tagged: el.hasAttribute("data-sw-patched"),
      }
    })

    // Guard the guard: if :hover is not matching, the rest proves nothing.
    expect(hovered.matchesHover).toBe(true)
    // Untagged is the precondition for the whole defect — a transparent row
    // is skipped by decide() on OPACITY_SKIP_THRESHOLD, so no per-surface
    // rule exists to beat the vendor's hover colour.
    expect(hovered.tagged).toBe(false)
    expect(hovered.background).not.toBe(VENDOR_HOVER)
    expect(luminanceOf(hovered.background)).toBeLessThan(DARK_ENOUGH)
  })

  test("does not blank every ancestor up to body", async ({ fixture }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)
    await page.waitForTimeout(700)

    await page.hover("#row-a")

    const ancestors = await page.evaluate(() => {
      const backgroundOf = (id: string): string => {
        const el = document.getElementById(id)
        if (el === null) throw new Error(`missing: ${id}`)
        return getComputedStyle(el).backgroundColor
      }
      return {
        // #card is NOT an ancestor of the hovered row, and must be untouched.
        card: backgroundOf("card"),
        // #rows IS an ancestor: the pointer is inside it, so it matches
        // :hover. Without :not(:has(:hover)) the cancel would strip its
        // background too, and every ancestor's, all the way to <body>.
        rows: backgroundOf("rows"),
        body: getComputedStyle(document.body).backgroundColor,
      }
    })

    expect(luminanceOf(ancestors.card)).toBeLessThan(DARK_ENOUGH)
    expect(luminanceOf(ancestors.rows)).toBeLessThan(DARK_ENOUGH)
    expect(luminanceOf(ancestors.body)).toBeLessThan(DARK_ENOUGH)
  })
})
