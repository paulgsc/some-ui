/**
 * Do the foyer's wings and Practice Home fit the phone, now that each card
 * that opens a wing or a round is a card link (#3234)? Each fixture
 * (`./phone-page/wings.tsx`) at each of the phone's sizes, held sideways
 * included. As `fitsEachPhone`, but these screens say everything in their
 * cards, so each waits for its first link rather than a paragraph.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/wings-fit.spec.ts
 */
import { expect, test } from "@playwright/test"

import { expectFitsPhone, PHONE_VIEWPORTS, servePhonePage } from "./harness"
import type { WingsId } from "./phone-page/wings"

const FIXTURES: ReadonlyArray<WingsId> = ["wings-foyer", "wings-practice"]

test.describe("The foyer and Practice Home fit the phone", () => {
  const PAGE = servePhonePage()
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
        await expect(page.locator("[data-fit-slot] a").first()).toBeVisible()
        expect(errors, errors.join("\n")).toEqual([])
        await expectFitsPhone(page, fixture)
      })
    }
  }
})
