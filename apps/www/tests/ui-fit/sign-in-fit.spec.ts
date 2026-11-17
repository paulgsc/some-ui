/**
 * Does the phone's header hold the sign-in mark in each of its looks?
 * (SIGNIN1, #3087.) The header of Practice's Home, the wing with the most in
 * its header (`./phone-page/sign-in-header.tsx`): every control inside the
 * screen and the row, none over another, the mark the same size in every
 * look (HS1), and its sheet's words inside the screen once opened.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/sign-in-fit.spec.ts
 *
 * With `SIGN_IN_SHOTS=<dir>`, it also saves the header, and the sheet
 * opened, at each size, for a review to look at.
 */

import { expect, test, type Page } from "@playwright/test"

import { PHONE_VIEWPORTS, servePhonePage } from "./harness"

const PAGE = servePhonePage()

/** The phone sizes, and a common tall phone. */
const SIZES = [
  ...PHONE_VIEWPORTS,
  { name: "phone-390", width: 390, height: 844 },
] as const

const LOOKS = ["reading", "out", "in", "away", "lost"] as const

type Box = { left: number; top: number; right: number; bottom: number }

type Measure = {
  screen: Box
  row: Box
  rowCutX: number
  controls: Array<{ name: string; box: Box }>
}

function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const boxOf = (element: Element): Box => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    }
    const row = document.querySelector("header")!
    const controls = Array.from(row.querySelectorAll("a, button, span")).filter(
      (element) => element.parentElement?.closest("a, button") === null
    )
    return {
      screen: {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      },
      row: boxOf(row),
      rowCutX: row.scrollWidth - row.clientWidth,
      controls: controls
        .filter((element) => element.parentElement !== null)
        .filter(
          (element) =>
            element.tagName !== "SPAN" ||
            element.getAttribute("aria-hidden") === "true"
        )
        .map((element) => ({
          name: element.getAttribute("aria-label") ?? element.textContent,
          box: boxOf(element),
        })),
    }
  })
}

const inside = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left - 1 &&
  inner.top >= outer.top - 1 &&
  inner.right <= outer.right + 1 &&
  inner.bottom <= outer.bottom + 1

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 1 &&
  b.left < a.right - 1 &&
  a.top < b.bottom - 1 &&
  b.top < a.bottom - 1

const SHOTS = process.env.SIGN_IN_SHOTS

test.describe("the phone's header holds the sign-in mark", () => {
  PAGE.skipUnbuilt()

  for (const phone of SIZES) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      const sizes: Array<string> = []

      for (const look of LOOKS) {
        await page.goto(PAGE.url(`sign-in-${look}`), { waitUntil: "load" })
        const mark = page.locator(`button[data-signed-in="${look}"]`)
        await expect(mark).toBeVisible()
        expect(errors, errors.join("\n")).toEqual([])

        const at = await measure(page)
        expect(inside(at.row, at.screen), `${look}: the row leaves`).toBe(true)
        expect(at.rowCutX, `${look}: the row is cut`).toBeLessThanOrEqual(1)
        for (const [index, control] of at.controls.entries()) {
          expect(
            inside(control.box, at.row),
            `${look}: ${control.name} leaves the row`
          ).toBe(true)
          for (const other of at.controls.slice(index + 1)) {
            expect(
              overlap(control.box, other.box),
              `${look}: ${control.name} overlaps ${other.name}`
            ).toBe(false)
          }
        }
        const box = await mark.boundingBox()
        sizes.push(box === null ? "none" : `${box.width}x${box.height}`)

        if (SHOTS) {
          await page
            .locator("header")
            .screenshot({ path: `${SHOTS}/${phone.name}-${look}-header.png` })
        }
        await mark.click()
        const sheet = page.getByRole("dialog")
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole("link").last()).toBeInViewport({
          ratio: 1,
        })
        if (SHOTS) {
          await page.screenshot({
            path: `${SHOTS}/${phone.name}-${look}-sheet.png`,
          })
        }
      }
      // HS1: the mark keeps its size whatever it says.
      expect(new Set(sizes).size, sizes.join(", ")).toBe(1)
    })
  }
})
