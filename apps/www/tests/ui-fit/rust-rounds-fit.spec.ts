/**
 * Does each Rust Rounds screen fit the phone? (RR4, #2235.)
 *
 * jsdom lays nothing out, so this walks the `rust-rounds` fixture
 * (`./panel-page/rust-rounds.tsx`) at the phone's sizes (`PHONE_VIEWPORTS`,
 * 360px wide and the phone held sideways among them), with Skip and Next
 * alone: the menu, every card of the worked example before and after
 * rustc's result, and the tutor's page. On each it measures what leaves the
 * granted rect, and that nothing is wider than the phone: code and rustc's
 * output scroll sideways inside their own boxes and never wrap.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/rust-rounds-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  RUST_ROUNDS_FIXTURE,
  servePanelPage,
} from "./harness"

const PAGE = servePanelPage()

test.describe.configure({ timeout: 3 * 60 * 1000 })

/** The worked example's cards, a to d. */
const CARDS = 4

async function expectFits(page: Page, screen: string): Promise<void> {
  const { mounted, violations } = await findViolations(page)
  expect(mounted, screen).toBe(true)
  expect(
    violations.map((violation) => describeViolation(screen, violation))
  ).toEqual([])
  const fit = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      "[data-rust-rounds-page]"
    )!
    // Every printed block is as wide as the column; its text scrolls.
    const wrapped = Array.from(document.querySelectorAll("pre")).flatMap(
      (pre) =>
        getComputedStyle(pre).whiteSpace === "pre" ? [] : [pre.textContent]
    )
    return {
      wide: scroller.scrollWidth - scroller.clientWidth,
      wrapped,
      windowScrollX: window.scrollX,
    }
  })
  expect(fit.wide, `${screen}: wider than the phone`).toBeLessThanOrEqual(0)
  expect(fit.wrapped, `${screen}: output that wraps`).toEqual([])
  expect(fit.windowScrollX).toBe(0)
}

test.describe("Rust Rounds fits the phone, screen by screen", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(RUST_ROUNDS_FIXTURE), { waitUntil: "load" })
      await expect(
        page.getByRole("heading", { name: "Rust Rounds" })
      ).toBeVisible()
      expect(errors, errors.join("\n")).toEqual([])

      await expectFits(page, "the menu")
      await page.getByRole("button", { name: "Start" }).click()

      for (let card = 1; card <= CARDS; card += 1) {
        await expect(
          page.getByRole("figure", { name: "The program" })
        ).toBeVisible()
        await expectFits(page, `card ${card}, choosing`)
        await page.getByRole("button", { name: "Skip, show me rustc" }).click()
        await expect(page.locator("pre").first()).toBeVisible()
        await expectFits(page, `card ${card}, rustc's result`)
        await page.getByRole("button", { name: "Next", exact: true }).click()
      }

      // A choice's spoken prompt, with the microphone at rest.
      await page.getByRole("button", { name: "Not sure" }).click()
      await expect(
        page.getByRole("button", { name: "Hold to speak" })
      ).toBeVisible()
      await expectFits(page, "speaking")

      await page.getByRole("button", { name: "Menu" }).click()
      await page.getByRole("button", { name: "Tutor" }).click()
      await expect(
        page.getByRole("button", { name: "Copy for a tutor" })
      ).toBeVisible()
      await expectFits(page, "the tutor's page")
    })
  }
})
