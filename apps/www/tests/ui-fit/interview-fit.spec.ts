/**
 * Does the interview week fit the phone? (IW5, #2936.)
 *
 * The week is the phone's alone, so it is swept on the phone page
 * (`./phone-page`, built under the Android app's profile) at the phone's
 * sizes (`PHONE_VIEWPORTS`, the phone held sideways among them): the brief, a
 * question's card, a read's card with its script, the same while its cue
 * counts, and the look over. Each must leave the page as it was and never be
 * wider than the phone; a read's script scrolls inside its own box.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/interview-fit.spec.ts
 */

import { expect, test } from "@playwright/test"

import { expectFitsPhone, PHONE_VIEWPORTS, servePhonePage } from "./harness"

const PAGE = servePhonePage()

test.describe("the interview week fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url("interview"), { waitUntil: "load" })
      await expect(page.getByText("Backend engineer at Tidewell")).toBeVisible()
      expect(errors, errors.join("\n")).toEqual([])
      await expectFitsPhone(page, "the brief")

      await page
        .getByRole("button", { name: /^Tell me about a time you disagreed/ })
        .click()
      await expect(
        page.getByRole("region", { name: "Card 2 of 6" })
      ).toBeVisible()
      await expectFitsPhone(page, "a question's card")

      await page.getByRole("button", { name: "Card 5, not said yet" }).click()
      const read = page.getByRole("region", { name: "Card 5 of 6" })
      await expect(read.locator("[data-script]")).toBeVisible()
      await expectFitsPhone(page, "a read's card")

      await read.getByRole("button", { name: "Start talking" }).click()
      await expect(read.getByText("Recording in 3")).toBeVisible()
      await expectFitsPhone(page, "a read's cue")
      await read.getByRole("button", { name: "Start talking" }).click()

      await page
        .getByRole("button", { name: "Look it over before sending" })
        .click()
      await expectFitsPhone(page, "the look over")
    })
  }
})
