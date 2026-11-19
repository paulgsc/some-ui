/**
 * Does the work tracker fit, and read, in every theme? (RR26, #3250.)
 *
 * Walks the `work-tracker` fixture (`./panel-page/work-tracker.tsx`): the
 * control after the tracker stopped itself, with "Were you working this
 * whole time?" put away (the sheet is the overlay plane, measured by none),
 * then, answered, what was counted over the screen and
 * the week's time as bars and as a table. At each of the four sizes
 * (`VIEWPORTS`) it measures what leaves the granted rect and that nothing is
 * wider than the page. Then, at the phone's size, it captures the sheet and
 * the week's time under each session theme the app ships, for the PR.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/work-tracker-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import { SESSION_THEMES } from "@some-ui/styles/theme"

import {
  describeViolation,
  findViolations,
  servePanelPage,
  VIEWPORTS,
  WORK_TRACKER_FIXTURE,
} from "./harness"

const PAGE = servePanelPage()

test.describe.configure({ timeout: 3 * 60 * 1000 })

/** Waits for the sheet's slide and every other animation to end. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((each) => each.playState !== "running")
  )
}

async function expectFits(page: Page, screen: string): Promise<void> {
  await settled(page)
  const { mounted, violations } = await findViolations(page)
  expect(mounted, screen).toBe(true)
  expect(
    violations.map((violation) => describeViolation(screen, violation))
  ).toEqual([])
  const wide = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      "[data-work-tracker-page]"
    )!
    return scroller.scrollWidth - scroller.clientWidth + window.scrollX
  })
  expect(wide, `${screen}: wider than the page`).toBeLessThanOrEqual(0)
}

async function open(page: Page): Promise<void> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(WORK_TRACKER_FIXTURE), { waitUntil: "load" })
  await expect(
    page.getByRole("heading", { name: "Welcome back" })
  ).toBeVisible()
  expect(errors, errors.join("\n")).toEqual([])
}

test.describe("the work tracker fits", () => {
  PAGE.skipUnbuilt()

  for (const size of VIEWPORTS) {
    test(`at ${size.name} (${size.width}x${size.height})`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: size.width, height: size.height })
      await open(page)
      // The sheet is the overlay plane, which the sweep leaves out, and its
      // modal lock folds the page under it: measure with it put away, as
      // the owner can, then answer from it again.
      await page.keyboard.press("Escape")
      await expectFits(page, "asking on return, the sheet put away")
      await page
        .getByRole("button", { name: "Were you working this whole time?" })
        .click()
      await page.getByRole("button", { name: /^Count / }).click()
      await expect(page.getByText(/^Counted /)).toBeVisible()
      await expectFits(page, "counted, with the week's time")
      await page.getByRole("button", { name: "Show as a table" }).click()
      await expect(page.getByRole("table")).toBeVisible()
      await expectFits(page, "the week's time as a table")
    })
  }
})

test.describe("the work tracker in every theme", () => {
  PAGE.skipUnbuilt()

  test("captures the ask and the week's time", async ({ page }, info) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 412, height: 915 })
    for (const theme of SESSION_THEMES) {
      await open(page)
      // As the session controller does: the theme's classes on the root.
      await page.evaluate((classes) => {
        document.documentElement.className = classes.join(" ")
      }, theme.boundary.classNames)
      await page.waitForTimeout(300)
      await settled(page)
      await page.screenshot({
        path: info.outputPath(`work-tracker-ask-${theme.id}.png`),
      })
      await page.getByRole("button", { name: /^Count / }).click()
      await expect(page.getByText(/^Counted /)).toBeVisible()
      await settled(page)
      await page.screenshot({
        path: info.outputPath(`work-tracker-week-${theme.id}.png`),
      })
    }
  })
})
