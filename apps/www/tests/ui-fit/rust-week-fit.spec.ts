/**
 * Does a week of Rust Rounds fit, step by step? (RR25, #3249; RR29, #3257.)
 *
 * The `rust-week` fixture (`./phone-page/rust-week.tsx`) is the `/2`
 * sample week on the phone. This walks it by its own buttons, as the owner
 * would: the brief, then TB-101's read (the constraints by id, the program,
 * rustc's E0507 and both forks' options), its academy, an exercise opened
 * and ticked, and its voice with a pick at the open fork. Each screen is
 * measured for what leaves the room the shell gives it (`expectFitsPhone`).
 *
 * At the four sizes of `VIEWPORTS` (the APK on a tablet gets the wide
 * window too) and the two phones of `PHONE_VIEWPORTS` that `VIEWPORTS`
 * lacks.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/rust-week-fit.spec.ts
 */

import { expect, test } from "@playwright/test"

import {
  expectFitsPhone,
  PHONE_VIEWPORTS,
  servePhonePage,
  VIEWPORTS,
} from "./harness"

const PAGE = servePhonePage()

const SIZES = [
  ...VIEWPORTS,
  ...PHONE_VIEWPORTS.filter(
    (phone) => !VIEWPORTS.some((each) => each.name === phone.name)
  ),
]

test.describe.configure({ timeout: 2 * 60 * 1000 })

test.describe("a week's flow fits, step by step", () => {
  PAGE.skipUnbuilt()

  for (const size of SIZES) {
    test(`at ${size.name} (${size.width}x${size.height})`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: size.width, height: size.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url("rust-week"), { waitUntil: "load" })
      await expect(page.getByText("Tallowbrook")).toBeVisible()
      await expectFitsPhone(page, "the brief")

      await page
        .getByRole("button", { name: /^TB-101 · Print each queued/ })
        .click()
      await expect(
        page.getByRole("region", { name: "TB-101 · Read" })
      ).toBeVisible()
      await expectFitsPhone(page, "read")

      await page.getByRole("button", { name: "On to the academy" }).click()
      await expect(
        page.getByRole("region", { name: "TB-101 · Academy" })
      ).toBeVisible()
      await expectFitsPhone(page, "the academy")

      await page
        .getByRole("button", { name: /A struct of plain fields still moves/ })
        .click()
      await expect(
        page.getByRole("button", { name: "I did this at my desk" })
      ).toBeVisible()
      await expectFitsPhone(page, "an exercise")
      await page.getByRole("button", { name: "I did this at my desk" }).click()
      await page.getByRole("button", { name: "The academy" }).click()

      await page.getByRole("button", { name: "On to your decisions" }).click()
      const voice = page.getByRole("region", { name: "TB-101 · Voice" })
      await expect(voice).toBeVisible()
      await voice.getByRole("radio").nth(1).click()
      await expect(voice.getByRole("radio").nth(1)).toHaveAttribute(
        "aria-checked",
        "true"
      )
      await expectFitsPhone(page, "voice, a fork picked")
      expect(errors, errors.join("\n")).toEqual([])
    })
  }
})
