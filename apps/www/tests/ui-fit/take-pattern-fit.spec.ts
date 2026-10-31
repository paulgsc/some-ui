/**
 * Do the take pattern's parts fit the phone? (MIC2, #2372.)
 *
 * jsdom lays nothing out, so this measures the `take-pattern` fixture
 * (`./panel-page/take-pattern.tsx`) at the phone's sizes (`PHONE_VIEWPORTS`,
 * 360px wide and the phone held sideways among them): the take rows with
 * their earlier takes opened, an item at its max, and the large button
 * while it records. On each it measures what leaves the granted rect and
 * that nothing is wider than the phone.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/take-pattern-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  servePanelPage,
  TAKE_PATTERN_FIXTURE,
} from "./harness"

const PAGE = servePanelPage()

async function expectFits(page: Page, state: string): Promise<void> {
  const { mounted, violations } = await findViolations(page)
  expect(mounted, state).toBe(true)
  expect(
    violations.map((violation) => describeViolation(state, violation))
  ).toEqual([])
  const fit = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>(
      '[data-scroll-intent="page"]'
    )!
    // Every row and every control sits inside the column's width.
    const wide = Array.from(
      column.querySelectorAll<HTMLElement>("li, button")
    ).flatMap((element) =>
      element.getBoundingClientRect().right >
      column.getBoundingClientRect().right + 0.5
        ? [element.textContent]
        : []
    )
    return {
      wide,
      over: column.scrollWidth - column.clientWidth,
      windowScrollX: window.scrollX,
    }
  })
  expect(fit.wide, `${state}: wider than the phone`).toEqual([])
  expect(fit.over, `${state}: scrolls sideways`).toBeLessThanOrEqual(0)
  expect(fit.windowScrollX).toBe(0)
}

test.describe("the take button, rows and list fit the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(TAKE_PATTERN_FIXTURE), { waitUntil: "load" })

      await expect(page.getByRole("listitem")).toHaveCount(4)
      expect(errors, errors.join("\n")).toEqual([])
      await expectFits(page, "the rows")

      await page.getByText("Earlier takes (2)").click()
      await expect(page.getByRole("listitem")).toHaveCount(6)
      await expectFits(page, "the earlier takes opened")

      await page.getByRole("button", { name: "Record it again" }).click()
      const live = page.getByRole("button", { pressed: true })
      await expect(live).toContainText("0:01 / 1:00")
      await expectFits(page, "the large button recording")
      await live.click()
      await expect(page.getByText("Kept.", { exact: true })).toBeVisible()
      await expectFits(page, "a redo kept")
    })
  }
})
