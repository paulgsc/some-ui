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
 * And at the largest text size (RR23, #3243): Android's largest font scale
 * doubles the text, so the root font size is set to 200% and card a, which
 * rustc refused, is measured laid out and with its printout open. Nothing
 * scrolls sideways there but a code region: the program's card, a
 * suggestion's card and rustc's printout.
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
        await expect(page.locator("pre").first()).toBeVisible()
        await expectFits(page, `card ${card}, with rustc's result`)
        await page.getByRole("button", { name: "Next", exact: true }).click()
      }

      // The card's take, with the microphone at rest.
      await expect(
        page.getByRole("button", { name: "Start talking" })
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

/** Android's largest font scale: text at twice its size, layout in px unchanged. */
const LARGEST_TEXT = "html { font-size: 200% !important; }"

/**
 * Everything that scrolls sideways, or is wider than the page, outside a
 * code region (`data-scroll-intent="code-display"`), named for the report.
 */
async function sidewaysOutsideCode(page: Page): Promise<Array<string>> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      "[data-rust-rounds-page]"
    )!
    const right = scroller.getBoundingClientRect().right
    return Array.from(scroller.querySelectorAll<HTMLElement>("*")).flatMap(
      (element) => {
        if (element.closest('[data-scroll-intent="code-display"]')) return []
        const scrolls = element.scrollWidth > element.clientWidth + 1
        const overflowX = getComputedStyle(element).overflowX
        const sideways =
          scrolls && (overflowX === "auto" || overflowX === "scroll")
        const past = element.getBoundingClientRect().right > right + 1
        if (!sideways && !past) return []
        const text = element.textContent.trim().slice(0, 40)
        return [`<${element.tagName.toLowerCase()}> "${text}"`]
      }
    )
  })
}

test.describe("rustc's result fits the phone at the largest text size", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await page.goto(PAGE.url(RUST_ROUNDS_FIXTURE), { waitUntil: "load" })
      await page.addStyleTag({ content: LARGEST_TEXT })
      await page.getByRole("button", { name: "Start" }).click()

      // Card a: rustc's E0277, laid out from its JSON.
      const said = page.getByRole("figure", { name: "What rustc said" })
      await expect(said).toBeVisible()
      await expect(said).toContainText("error[E0277]:")
      expect(await sidewaysOutsideCode(page), "laid out").toEqual([])

      await page.getByText("What rustc printed", { exact: true }).click()
      await expect(page.locator("details pre")).toBeVisible()
      expect(await sidewaysOutsideCode(page), "printout open").toEqual([])

      const { violations } = await findViolations(page)
      expect(
        violations.map((violation) =>
          describeViolation("card a, largest text", violation)
        )
      ).toEqual([])
    })
  }
})
