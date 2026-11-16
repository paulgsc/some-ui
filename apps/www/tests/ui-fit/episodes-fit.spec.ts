/**
 * Does Studio's Episodes, by week, fit the phone? (EPISODES2, #3067.) Each
 * fixture (`./phone-page/episodes.tsx`) at each of the phone's sizes, held
 * sideways included: the chip bar scrolls sideways on its own, and nothing
 * else may.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/episodes-fit.spec.ts
 */
import { expect, test } from "@playwright/test"

import { expectFitsPhone, PHONE_VIEWPORTS, servePhonePage } from "./harness"
import type { EpisodesId } from "./phone-page/episodes"

const PAGE = servePhonePage()

const FIXTURES: ReadonlyArray<EpisodesId> = [
  "episodes-all",
  "episodes-call",
  "episodes-trouble",
  "episodes-unpaired",
]

test.describe("Studio's Episodes fits the phone", () => {
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
