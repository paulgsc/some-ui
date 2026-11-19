/**
 * Does a card that opens something stand out from one that doesn't, in every
 * theme? (#3234.) The owner: "if a card is a button that goes somewhere, it
 * should look like a button." On a question's page of the interview week
 * (the phone page's `interview` fixture), each rung is a `CardLink` and
 * "What to cover" is a plain card. Under each session theme, each outline is
 * laid over what it is painted on (the page, then the card's own top colour,
 * `bg-card` for both: the link's gradient starts there), and the card link's
 * must stand off the page by `OUTLINE`, and by `MARGIN` more than the plain
 * card's, so it never reads as the same card with a chevron. The two numbers
 * are where the first look (an outline at 25%) failed three of six themes and
 * this one passes all six (C633).
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/card-link-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import { CONTRAST_FLOOR, SESSION_THEMES } from "@some-ui/styles/theme"

import { servePhonePage } from "./harness"

const PAGE = servePhonePage()

/** How far a card link's outline stands off the page, at least (WCAG ratio). */
const OUTLINE = 1.6
/** How much further it stands off than a plain card's outline. */
const MARGIN = 0.4

type Rgb = readonly [number, number, number]

/** WCAG's contrast ratio between two sRGB colors. */
function contrast(a: Rgb, b: Rgb): number {
  const lum = ([r, g, b2]: Rgb): number => {
    const lin = (c: number): number => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b2)
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** The page's ground, the card link's outline and a plain card's, as painted. */
async function outlines(
  page: Page
): Promise<{ ground: Rgb; link: Rgb; plain: Rgb }> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (ctx === null) throw new Error("no canvas")
    /** `layers` painted in order onto one pixel: what the eye gets. */
    const paint = (layers: ReadonlyArray<string>): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      for (const fill of layers) {
        ctx.fillStyle = fill
        ctx.fillRect(0, 0, 1, 1)
      }
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    /** The nearest painted background at or above `el`. */
    const groundOf = (el: Element | null): string => {
      for (let at = el; at !== null; at = at.parentElement) {
        const bg = getComputedStyle(at).backgroundColor
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg
      }
      return "white"
    }
    // The rungs' nav holds only the rung links.
    const link = document.querySelector("nav a")
    const plain = [...document.querySelectorAll("section")].find((s) =>
      s.textContent.startsWith("What to cover")
    )
    if (!link || !plain) throw new Error("no card link or plain card")
    const ground = groundOf(link.parentElement)
    // A border is painted over its element's own background: the card's.
    const card = getComputedStyle(plain).backgroundColor
    return {
      ground: paint([ground]),
      link: paint([ground, card, getComputedStyle(link).borderTopColor]),
      plain: paint([ground, card, getComputedStyle(plain).borderTopColor]),
    }
  })
}

test.describe("a card that opens something stands out in every theme", () => {
  PAGE.skipUnbuilt()

  test("its outline stands off the page, and off a plain card's", async ({
    page,
  }) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(PAGE.url("interview"), { waitUntil: "load" })
    await page.getByRole("link", { name: /^Today's question/ }).click()
    await expect(page.getByText("What to cover")).toBeVisible()
    // Off every card, so no rung is measured hovered.
    await page.mouse.move(0, 0)
    const failures: Array<string> = []
    for (const theme of SESSION_THEMES) {
      // As the session controller does: the theme's classes on the root.
      await page.evaluate((classes) => {
        document.documentElement.className = classes.join(" ")
      }, theme.boundary.classNames)
      await page.waitForTimeout(300)
      const { ground, link, plain } = await outlines(page)
      const linked = contrast(link, ground)
      const flat = contrast(plain, ground)
      if (linked < OUTLINE || linked < flat + MARGIN) {
        failures.push(
          `${theme.id}: card link ${linked.toFixed(2)}:1, plain card ${flat.toFixed(2)}:1`
        )
      }
    }
    expect(failures, failures.join("\n")).toEqual([])
  })
})

/**
 * The brand card's words over the brand card (#3236): under a dark theme the
 * card link's own `dark:` tint once outranked the brand's stop and faded the
 * card toward the page, leaving its last line hard to read. Each line of
 * today's question must clear the text floor against both of the card's
 * stops (a line between them sits on a mix of the two), each laid over the
 * page since a stop may be a tint, with every opacity from the line up to the
 * card counted.
 */
async function brandLines(page: Page): Promise<
  ReadonlyArray<{
    text: string
    pairs: ReadonlyArray<{ ink: Rgb; ground: Rgb }>
  }>
> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (ctx === null) throw new Error("no canvas")
    const paint = (
      layers: ReadonlyArray<{ fill: string; alpha: number }>
    ): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      for (const { fill, alpha } of layers) {
        ctx.globalAlpha = alpha
        ctx.fillStyle = fill
        ctx.fillRect(0, 0, 1, 1)
      }
      ctx.globalAlpha = 1
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const card = [...document.querySelectorAll("a")].find((a) =>
      a.textContent.startsWith("Today's question")
    )
    if (card === undefined) throw new Error("no today's question")
    // The gradient's stops, top and bottom.
    const stops =
      getComputedStyle(card).backgroundImage.match(
        /(?:oklch|oklab|rgba?|color|lab|lch)\([^)]*\)/g
      ) ?? []
    const top = stops[0] ?? getComputedStyle(card).backgroundColor
    const bottom = stops.at(-1) ?? top
    // A stop may be a tint: it shows the page beneath it.
    let page = "white"
    for (let at = card.parentElement; at !== null; at = at.parentElement) {
      const bg = getComputedStyle(at).backgroundColor
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        page = bg
        break
      }
    }
    const lines = [...card.querySelectorAll("span")].filter(
      (span) =>
        span.children.length === 0 &&
        span.textContent.trim() !== "" &&
        span.closest("[aria-hidden]") === null
    )
    return lines.map((span) => {
      // Its own opacity and every one above it inside the card.
      let alpha = 1
      for (
        let at: Element | null = span;
        at !== null && at !== card;
        at = at.parentElement
      ) {
        alpha *= Number(getComputedStyle(at).opacity)
      }
      const color = getComputedStyle(span).color
      // Read against both stops: a line between them sits on a mix of the two.
      return {
        text: span.textContent.trim(),
        pairs: [top, bottom].map((stop) => ({
          ground: paint([
            { fill: page, alpha: 1 },
            { fill: stop, alpha: 1 },
          ]),
          ink: paint([
            { fill: page, alpha: 1 },
            { fill: stop, alpha: 1 },
            { fill: color, alpha },
          ]),
        })),
      }
    })
  })
}

test.describe("the brand card's words read in every theme", () => {
  PAGE.skipUnbuilt()

  test("each line of today's question clears the text floor", async ({
    page,
  }) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(PAGE.url("interview"), { waitUntil: "load" })
    await expect(
      page.getByRole("link", { name: /^Today's question/ })
    ).toBeVisible()
    await page.mouse.move(0, 0)
    const failures: Array<string> = []
    for (const theme of SESSION_THEMES) {
      await page.evaluate((classes) => {
        document.documentElement.className = classes.join(" ")
      }, theme.boundary.classNames)
      await page.waitForTimeout(300)
      for (const { text, pairs } of await brandLines(page)) {
        const ratio = Math.min(
          ...pairs.map(({ ink, ground }) => contrast(ink, ground))
        )
        if (ratio < CONTRAST_FLOOR.text) {
          failures.push(`${theme.id}: "${text}" ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([])
  })
})
