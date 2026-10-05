/**
 * #741 ("guilty until innocent") — falsifiable proof, via the real
 * --load-extension pipeline, of three concrete "auto is bad at applying the
 * theme" claims from the issue. Each test asserts what *should* be true and
 * cites the responsible code path; see each fixture's header for the trace.
 *
 * The classifier-level companion (the same filter blindness behind the
 * first describe) lives in extensions/filter-classifier's corpus
 * (`filter-invert-reads-dark`/`filter-invert-reads-light`).
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  brightestIn,
  DARK,
  describeColor,
  viewportRegion,
} from "@filter/playwright/fixtures/pixels"

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

    // getComputedStyle never reflects `filter`; a human sees our token
    // through the vendor's still-active `invert(1)`, an exact per-channel
    // complement (CSS Filter Effects Level 1), replicated here.
    const asSeen: [number, number, number] = [
      1 - declared[0],
      1 - declared[1],
      1 - declared[2],
    ]
    const asSeenLuminance = relativeLuminance(...asSeen)

    // A dark canvas should still read dark once the page's own filter is
    // accounted for; under invert(1) our token composites to near-white.
    expect(
      asSeenLuminance,
      `declared computed bg ${rendered.bg} is a properly dark token, but ` +
        `composited through the page's own filter: invert(1) it reads as ` +
        `luminance ${asSeenLuminance.toFixed(3)} — bright, not dark`
    ).toBeLessThan(0.3)
  })
})

// ── prepaint veil poisoned by a previously-applied filter, across a new session ──

test.describe("the prepaint veil under a previously-applied filter, across a new session (#741)", () => {
  test("a second (SPA-navigation) session's anti-flash veil stays dark on screen while the page's own filter is still active", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("filter-invert-vendor-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    // Precondition: the first session already themed this page (established
    // by the sibling test above).
    const firstSession = await page.evaluate(
      () => document.body.dataset["swThemeApplied"]
    )
    expect(firstSession).toBe("dark")

    // Simulates an SPA re-navigation: content.ts's yt-navigate-* listeners
    // are plain window listeners. Only -start is dispatched; navigatingAway
    // then holds the veil up until -finish, making the capture deterministic.
    const veil = await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))
      const el = document.getElementById("__sw_prepaint_veil")
      return {
        present: el !== null,
        bg: el ? getComputedStyle(el).backgroundColor : null,
        inTopLayer: el === null ? null : el.matches(":popover-open"),
      }
    })

    expect(
      veil.present,
      "the new session should re-arm the anti-flash veil (enablePrepaint())"
    ).toBe(true)

    // ── why this asserts on pixels rather than on `1 - declared` ────────────
    //
    // The veil is top-layer, painted outside every ancestor filter, so the
    // vendor's invert(1) does not apply to it. Modelling it as inverted once
    // let a compensated light veil "read dark" while it rendered near-white
    // (rgb(232, 227, 218)) — #741's own symptom reproduced by its fix. Only a
    // screenshot tells them apart. The declared value is still reported on
    // failure, since a fix would change it.
    const { color, luminance } = await brightestIn(
      page,
      context,
      await viewportRegion(page)
    )

    expect(
      luminance,
      `the re-armed veil declared ${veil.bg ?? "(none)"} and, ` +
        `${veil.inTopLayer === true ? "in the top layer" : "in the filtered fallback"}, ` +
        `actually renders ${describeColor(color)}. The veil exists to hold a ` +
        `dark, flash-free canvas while a session settles — over a page with ` +
        `its own previously-applied filter: invert(1), it must still do so.`
    ).toBeLessThan(DARK)
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

    // WCAG AA's floor for body text is 4.5:1. #card's background is
    // darkened while its inline `color`, authored for white, is untouched:
    // the FilterAction alphabet has no per-surface foreground action, and the
    // static text rules don't cover bare <div>.
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

    // Both samplers read only backgroundColor; #gradient-card has only
    // backgroundImage, so it never becomes a SurfaceKey.
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
