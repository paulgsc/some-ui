/**
 * Does the interview week fit the phone? (IW5, #2936; IW8, #3175.)
 *
 * The week is the phone's alone, so it is swept on the phone page
 * (`./phone-page`, built under the Android app's profile) at the phone's
 * sizes (`PHONE_VIEWPORTS`, the phone held sideways among them), each page
 * of it (IW8, IW15, IW16): the Interview page fresh, under way and sent,
 * Questions, a question and its ladder, the study page, the answer read
 * aloud while its cue counts, a take said from cues, Scripts and a read's
 * page, how a week goes, and the look over. Each must leave the page
 * as it was and never be wider than the phone; a script moves inside its
 * own band (IW9).
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
      await expectFitsPhone(page, "the Interview page, before anything is said")

      await page.getByRole("link", { name: /^Questions/ }).click()
      await expect(
        page.getByRole("link", { name: /^Today's question/ })
      ).toBeVisible()
      await expectFitsPhone(page, "Questions")

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
      // The line under the script holds its place as the count starts (HS1).
      const line = aloud.locator("p", { hasText: /^A take stops at/ })
      const before = await line.boundingBox()
      await aloud.getByRole("button", { name: "Start talking" }).click()
      const after = await aloud
        .locator("p", { hasText: /call it off/ })
        .boundingBox()
      expect(before).not.toBeNull()
      expect(after?.height).toBe(before?.height)
      await expect(
        aloud.getByRole("button", { name: /^Recording in 3/ })
      ).toBeVisible()
      await expectFitsPhone(page, "the answer read aloud, its cue counting")
      await aloud.getByRole("button", { name: /Tap to call it off/ }).click()

      await page.getByRole("link", { name: "The answer" }).click()
      await page.getByRole("link", { name: "The question" }).click()
      await page.getByRole("link", { name: /Say it from cues/ }).click()
      const card = page.locator("[data-card]")
      await expect(card).toBeVisible()
      await expectFitsPhone(page, "a take said from cues")
      // A take, so the week is under way: no cue counts on this rung.
      await card.locator("[data-take]").click()
      // The phone's own cap, as "A take stops at 2 min" says (IW18).
      await expect(card.getByText(/ \/ 2:00$/)).toBeVisible()
      await page.waitForTimeout(1_500)
      await card.locator("[data-take]").click()
      await expect(card.getByText(/going home/)).toBeVisible()

      await page.getByRole("link", { name: "The question" }).click()
      await page.getByRole("link", { name: "Questions" }).click()
      await page.getByRole("link", { name: "Interview" }).click()
      await expect(page.getByText("So far this week")).toBeVisible()
      await expectFitsPhone(page, "the Interview page, a week under way")

      await page.getByRole("link", { name: /^Scripts/ }).click()
      await expectFitsPhone(page, "Scripts")
      await page.getByRole("link", { name: /^Opening a team demo/ }).click()
      await expect(page.locator("[data-script]")).toBeVisible()
      await expectFitsPhone(page, "a read's page")

      await page.getByRole("link", { name: "Scripts" }).click()
      await page.getByRole("link", { name: "Interview" }).click()
      await page.getByRole("link", { name: /^How a week goes/ }).click()
      await expect(page.getByText("Your takes go home")).toBeVisible()
      await expectFitsPhone(page, "how a week goes")

      await page.getByRole("link", { name: "Interview" }).click()
      await page.getByRole("link", { name: /^Past weeks/ }).click()
      await expect(page.locator("[data-past-week]")).toHaveCount(4)
      await expectFitsPhone(page, "past weeks, each essay where it is")

      await page.getByRole("link", { name: "Interview" }).click()
      await page
        .getByRole("button", { name: "Look it over before sending" })
        .click()
      await expectFitsPhone(page, "the look over")
      await page.getByRole("button", { name: /^Send to home/ }).click()
      await page.getByRole("button", { name: "Back to the week" }).click()
      await expect(page.getByText(/is what counts/)).toBeVisible()
      await expectFitsPhone(page, "the Interview page, a sent week")
    })
  }
})
