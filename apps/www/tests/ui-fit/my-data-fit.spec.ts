/**
 * Does My data fit the phone? (MY-DATA MD2, #2476.)
 *
 * My data is the phone's alone, so it is swept on the phone page
 * (`./phone-page`, built under the Android app's profile) at the phone's
 * sizes (`PHONE_VIEWPORTS`, 780x390 among them), in each state
 * `./phone-page/my-data.tsx` draws, with every kind of recording and the
 * widest numbers it says: the overview, its tables shown, the overview
 * before home has answered, and a kind's list. Each must leave the page as
 * it was (the measure the panel sweep uses) and never be wider than the
 * phone.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/my-data-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  servePhonePage,
} from "./harness"
import type { MyDataId } from "./phone-page/my-data"

const PAGE = servePhonePage()

const FIXTURES: ReadonlyArray<MyDataId> = [
  "my-data",
  "my-data-unpaired",
  "my-data-kind",
]

/** No violation, and nothing wider than the phone. */
async function expectFits(page: Page, where: string): Promise<void> {
  const { mounted, violations } = await findViolations(page)
  expect(mounted).toBe(true)
  expect(
    violations.map((violation) => describeViolation(where, violation))
  ).toEqual([])
  const wide = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(
      "[data-scroll-intent=page]"
    )!
    return { scroll: body.scrollWidth, room: body.clientWidth }
  })
  expect(wide.scroll, `${where} is wider than the phone`).toBeLessThanOrEqual(
    wide.room + 1
  )
}

test.describe("My data fits the phone", () => {
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
        await expect(page.locator("[data-fit-slot] li").first()).toBeVisible()
        expect(errors, errors.join("\n")).toEqual([])
        await expectFits(page, fixture)

        if (fixture === "my-data") {
          await page.getByRole("button", { name: "Show as a table" }).click()
          await expect(page.getByRole("table")).toHaveCount(3)
          await expectFits(page, `${fixture} with its tables`)
        }
      })
    }
  }
})
