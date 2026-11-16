/**
 * Does Studio's Takes, in compartments, fit the phone? (TAKES3, #3069.)
 * Each fixture (`./phone-page/takes.tsx`) at each of the phone's sizes,
 * held sideways included: the tiles, a compartment's cards under the chip
 * bar (which scrolls sideways on its own, and nothing else may), and a
 * phone not paired.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/takes-fit.spec.ts
 */
import { expect, test } from "@playwright/test"

import { expectFitsPhone, PHONE_VIEWPORTS, servePhonePage } from "./harness"
import type { TakesId } from "./phone-page/takes"

const PAGE = servePhonePage()

const FIXTURES: ReadonlyArray<TakesId> = [
  "takes-tiles",
  "takes-all",
  "takes-note",
  "takes-unpaired",
]

test.describe("Studio's Takes fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    for (const fixture of FIXTURES) {
      test(`${fixture} at ${phone.name} (${phone.width}x${phone.height})`, async ({
        page,
      }) => {
        PAGE.expectBuilt()
        await page.setViewportSize({ width: phone.width, height: phone.height })
        const errors: Array<string> = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.goto(PAGE.url(fixture), { waitUntil: "load" })
        await expect(page.locator("[data-fit-slot] p").first()).toBeVisible()
        expect(errors, errors.join("\n")).toEqual([])
        await expectFitsPhone(page, fixture)
      })
    }
  }
})
