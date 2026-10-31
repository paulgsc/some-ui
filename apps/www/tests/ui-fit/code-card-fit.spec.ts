/**
 * Does the phone's code card fit the phone without wrapping its code? (RR2,
 * #2233.)
 *
 * Code on the phone never wraps: a long line scrolls sideways inside the
 * card, and the page never does. jsdom lays nothing out, so this measures
 * the `code-card` fixture (`./panel-page/code-card.tsx`), the worked
 * example's program with rustc's span on line 4 and a variant beside it, at
 * the phone's sizes (`PHONE_VIEWPORTS`, 360px wide and 780x390 among them).
 *
 * It also reads the card's colours from www's own build, where
 * `moduleSideEffects: false` would drop a grammar imported bare
 * (`packages/ui/shared/src/lib/code-tokens`): a keyword painted plain means
 * the Rust grammar never loaded.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/code-card-fit.spec.ts
 */

import { expect, test } from "@playwright/test"

import {
  CODE_CARD_FIXTURE,
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  servePanelPage,
} from "./harness"

const PAGE = servePanelPage()

test.describe("the code card fits the phone and scrolls its code sideways", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(CODE_CARD_FIXTURE), { waitUntil: "load" })

      const program = page.getByRole("figure", { name: "The program" })
      await expect(program).toBeVisible()
      expect(errors, errors.join("\n")).toEqual([])

      const { mounted, violations } = await findViolations(page)
      expect(mounted).toBe(true)
      expect(
        violations.map((violation) => describeViolation("code card", violation))
      ).toEqual([])

      // rustc's span is a <mark>, painted as the card's underline alone.
      const mark = program.locator("mark[data-code-span]")
      await expect(mark).toHaveText("r")
      await expect(mark).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")

      // Highlighted by the Rust grammar, in www's own build.
      const fn = program.locator('[data-code-line="1"] span', {
        hasText: /^fn$/,
      })
      await expect(fn).toHaveClass(/text-primary/)

      const fit = await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>(
          'figure[aria-label="The program"] [data-scroll-intent]'
        )!
        const rows = Array.from(
          region.querySelectorAll<HTMLElement>("[data-code-line]")
        ).map((row) => row.getBoundingClientRect().height)
        // Each gutter cell sits level with its code row, in both cards.
        const misaligned = Array.from(
          document.querySelectorAll<HTMLElement>("[data-code-gutter]")
        ).flatMap((cell) => {
          const line = cell.dataset["codeGutter"] ?? ""
          const row = cell
            .closest("figure")!
            .querySelector<HTMLElement>(`[data-code-line="${line}"]`)!
          const off =
            cell.getBoundingClientRect().top - row.getBoundingClientRect().top
          return Math.abs(off) > 0.5 ? [`line ${line}: ${off}px`] : []
        })
        const scrolls = region.scrollWidth > region.clientWidth
        region.scrollLeft = region.scrollWidth
        return {
          misaligned,
          scrolls,
          scrolled: region.scrollLeft > 0,
          rows,
          pageWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          windowWidth: window.innerWidth,
          windowScrollX: window.scrollX,
        }
      })

      expect(fit.misaligned).toEqual([])
      // Line 5 is longer than any phone is wide: it scrolls, never wraps.
      expect(fit.scrolls).toBe(true)
      expect(fit.scrolled).toBe(true)
      expect(
        new Set(fit.rows).size,
        `row heights: ${fit.rows.join(", ")}`
      ).toBe(1)
      // And the page itself never scrolls sideways, even with the code
      // scrolled to its end.
      expect(fit.pageWidth).toBeLessThanOrEqual(fit.windowWidth)
      expect(fit.bodyWidth).toBeLessThanOrEqual(fit.windowWidth)
      expect(fit.windowScrollX).toBe(0)
    })
  }
})
