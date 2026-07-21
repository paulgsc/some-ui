/**
 * #741 ("guilty until innocent") — falsifiable proof, via the real
 * --load-extension pipeline, of three concrete "auto is bad at applying the
 * theme" claims from the issue. Deliberately not a fix for any of them: the
 * issue asks to prove these first, so every test below asserts what
 * *should* be true and is expected to fail against today's implementation.
 * Each test.describe below cites the exact code path responsible — see each
 * fixture's own header comment for the fuller trace.
 *
 * A companion classifier-level proof (the same filter-blindness root cause
 * behind the first describe below, isolated at the classifyPage()/detect()
 * level rather than the live pipeline) lives in
 * extensions/filter-classifier's corpus (`filter-invert-reads-dark`/
 * `filter-invert-reads-light`, tests/e2e/fixtures/corpus.ts).
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

// ── filter: invert — auto poisons its own remedy ────────────────────────────

test.describe("auto theme under a vendor-authored filter: invert (#741)", () => {
  test("the settled canvas still reads dark once the page's own invert filter is composited back in", async ({
    fixture,
  }) => {
    const page = await fixture.goto("filter-invert-vendor-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => ({
      themeApplied: document.body.dataset["swThemeApplied"],
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      bg: getComputedStyle(document.body).backgroundColor,
    }))

    // The pipeline does correctly decide to theme this page (its declared
    // colors are plain light) — the bug is entirely in what happens next.
    expect(rendered.themeApplied).toBe("dark")
    expect(rendered.hasDarkAttr).toBe(true)

    const match = rendered.bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (match === null) {
      throw new Error(`unparseable computed background: ${rendered.bg}`)
    }
    const [, rStr, gStr, bStr] = match
    if (rStr === undefined || gStr === undefined || bStr === undefined) {
      throw new Error(`unparseable computed background: ${rendered.bg}`)
    }
    const declared: [number, number, number] = [
      Number(rStr) / 255,
      Number(gStr) / 255,
      Number(bStr) / 255,
    ]

    // getComputedStyle never reflects `filter` — it reports the dark theme's
    // own token, undistorted. A human (or a screenshot) sees it composited
    // through the vendor's still-active `invert(1)`, which theme-apply.ts
    // never touches or removes. invert(1) is an exact per-channel
    // complement (CSS Filter Effects Level 1) — replicate that here to get
    // what actually reaches the screen.
    const asSeen: [number, number, number] = [
      1 - declared[0],
      1 - declared[1],
      1 - declared[2],
    ]
    const asSeenLuminance = relativeLuminance(...asSeen)

    // A properly dark, settled canvas should still read dark once the
    // page's own filter is accounted for — it does not: injecting our dark
    // token under an active invert(1) composites back to a bright, near-
    // white canvas, exactly the "auto removes the theme, revealing back the
    // white vendor bg" symptom, self-inflicted by the theme's own
    // application rather than any later event.
    expect(
      asSeenLuminance,
      `declared computed bg ${rendered.bg} is a properly dark token, but ` +
        `composited through the page's own filter: invert(1) it reads as ` +
        `luminance ${asSeenLuminance.toFixed(3)} — bright, not dark`
    ).toBeLessThan(0.3)
  })
})

// ── per-surface darkening with no matching per-surface text adjustment ──────

test.describe("auto theme's per-surface darkening leaves untargeted text unreadable (#741)", () => {
  test("a <div> surface's own text stays dark after its background is darkened out from under it", async ({
    fixture,
  }) => {
    const page = await fixture.goto("text-contrast-gap-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => {
      const card = document.getElementById("card")
      const style = card ? getComputedStyle(card) : null
      return {
        patched: card?.dataset["swPatched"],
        bg: style?.backgroundColor,
        text: style?.color,
      }
    })

    // The surface was recognized and darkened — confirms the failure below
    // isn't "nothing happened to this element at all".
    expect(
      rendered.patched,
      "#card's light background should have been classified as a surface"
    ).toBeDefined()

    function luminanceOf(css: string | undefined): number {
      const match = css?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
      if (!match) return Number.NaN
      const [, r, g, b] = match
      return relativeLuminance(
        Number(r) / 255,
        Number(g) / 255,
        Number(b) / 255
      )
    }

    function contrastRatio(a: number, b: number): number {
      const [hi, lo] = a >= b ? [a, b] : [b, a]
      return (hi + 0.05) / (lo + 0.05)
    }

    const bg = rendered.bg ?? "(none)"
    const text = rendered.text ?? "(none)"
    const bgLuminance = luminanceOf(rendered.bg)
    const textLuminance = luminanceOf(rendered.text)
    const contrast = contrastRatio(bgLuminance, textLuminance)

    // WCAG AA's own floor for ordinary body text is 4.5:1. #card's
    // background was hue-preserving-darkened (adapter/theme-adapter.ts,
    // adapter/actuator.ts's emit-surface-color) while its own inline
    // `color` — authored for readability against the *original* white
    // background — was never touched: no per-surface foreground action
    // exists in the FilterAction alphabet (adapter/contracts.ts), and
    // buildDarkThemeCSS's static text-color rules don't cover bare <div>.
    expect(
      contrast,
      `#card resolved to bg ${bg} / text ${text} — ` +
        `contrast ${contrast.toFixed(2)}:1, below WCAG AA's 4.5:1 floor`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

// ── background-image is invisible to classification ─────────────────────────

test.describe("auto theme cannot see background-image, only background-color (#741)", () => {
  test("a light-gradient surface is classified and no longer reads as a bright, untouched rectangle", async ({
    fixture,
  }) => {
    const page = await fixture.goto("gradient-leak-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => {
      const card = document.getElementById("gradient-card")
      const style = card ? getComputedStyle(card) : null
      return {
        patched: card?.dataset["swPatched"],
        backgroundImage: style?.backgroundImage ?? "",
      }
    })

    // pipeline.ts's readAttr() and theme-detector.ts's classifyPage() both
    // sample only getComputedStyle().backgroundColor — #gradient-card has
    // none (only backgroundImage), so it is never scored, never becomes a
    // SurfaceKey, and never receives a tag-surface/emit-surface-color
    // action.
    expect(
      rendered.patched,
      "the gradient surface should have been classified, like any other " +
        "light surface on the page"
    ).toBeDefined()

    expect(
      rendered.backgroundImage.includes("255, 255, 255"),
      `background-image is untouched by any theme rule (still ` +
        `"${rendered.backgroundImage}") — the light gradient renders exactly ` +
        "as authored, a bright rectangle on an otherwise-dark page"
    ).toBe(false)
  })
})
