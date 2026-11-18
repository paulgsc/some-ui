/**
 * Does the interview week fit the phone? (IW5, #2936; IW8, #3175.)
 *
 * The week is the phone's alone, so it is swept on the phone page
 * (`./phone-page`, built under the Android app's profile) at the phone's
 * sizes (`PHONE_VIEWPORTS`, the phone held sideways among them), each page
 * of it (IW8): the Interview page, a question and its ladder, the study
 * page, the answer read aloud while its cue counts, a take said from cues,
 * Read aloud and a read's page, and the look over. Each must leave the page
 * as it was and never be wider than the phone; a script scrolls inside its
 * own box.
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
      await expectFitsPhone(page, "the Interview page")

      await page.getByRole("link", { name: /^Today's question/ }).click()
      await expect(
        page.getByRole("link", { name: /Say it from cues/ })
      ).toBeVisible()
      await expectFitsPhone(page, "a question and its ladder")

      await page.getByRole("link", { name: /Read the answer/ }).click()
      await expect(page.getByText("A poor answer")).toBeVisible()
      await expectFitsPhone(page, "the study page")

      await page.getByRole("link", { name: "Read it aloud" }).click()
      const aloud = page.locator("[data-card]")
      await expect(aloud.locator("[data-script]")).toBeVisible()
      await aloud.getByRole("button", { name: "Start talking" }).click()
      await expect(aloud.getByText("Recording in 3")).toBeVisible()
      await expectFitsPhone(page, "the answer read aloud, its cue counting")
      await aloud.getByRole("button", { name: "Start talking" }).click()

      await page.getByRole("link", { name: "The answer" }).click()
      await page.getByRole("link", { name: "The question" }).click()
      await page.getByRole("link", { name: /Say it from cues/ }).click()
      await expect(page.locator("[data-card]")).toBeVisible()
      await expectFitsPhone(page, "a take said from cues")

      await page.getByRole("link", { name: "The question" }).click()
      await page.getByRole("link", { name: "Interview" }).click()
      await page.getByRole("link", { name: "Read aloud" }).click()
      await expectFitsPhone(page, "Read aloud")
      await page.getByRole("link", { name: /^Opening a team demo/ }).click()
      await expect(page.locator("[data-script]")).toBeVisible()
      await expectFitsPhone(page, "a read's page")

      await page.getByRole("link", { name: "Read aloud" }).click()
      await page.getByRole("link", { name: "Interview" }).click()
      await page
        .getByRole("button", { name: "Look it over before sending" })
        .click()
      await expectFitsPhone(page, "the look over")
    })
  }
})
