/**
 * Does Settings' bar of pages fit the phone? (MY-DATA MD1, #2475.) What it
 * measures, and why it measures the bar itself: docs/ui-fit/README.md, 2g.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/settings-bar-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import {
  PHONE_VIEWPORTS,
  servePhonePage,
  SETTINGS_BAR_FIXTURE,
} from "./harness"

const PAGE = servePhonePage()

/**
 * The phone's sizes, and a narrow phone on its side: 360px is the shortest
 * height a phone held sideways gives, and the rail's five tabs are what
 * that height has to hold. The shared matrix's sideways phone is 390px tall.
 */
const SIZES = [
  ...PHONE_VIEWPORTS,
  { name: "phone-narrow-landscape", width: 780, height: 360 },
] as const

type Box = { left: number; top: number; right: number; bottom: number }

type Measure = {
  screen: Box
  bar: Box
  rail: boolean
  tabs: Array<{ name: string; box: Box; cutX: number; cutY: number }>
  barCutX: number
  barCutY: number
}

/** The bar, its tabs, and the screen, as laid out now. */
function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const boxOf = (element: Element): Box => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    }
    const bar = document.querySelector<HTMLElement>(
      'nav[aria-label="Settings pages"]'
    )!
    const tabs = Array.from(bar.children).map((tab) => ({
      name: tab.textContent,
      box: boxOf(tab),
      cutX: tab.scrollWidth - tab.clientWidth,
      cutY: tab.scrollHeight - tab.clientHeight,
    }))
    const box = boxOf(bar)
    return {
      screen: {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      },
      bar: box,
      rail: box.bottom - box.top > box.right - box.left,
      tabs,
      barCutX: bar.scrollWidth - bar.clientWidth,
      barCutY: bar.scrollHeight - bar.clientHeight,
    }
  })
}

const inside = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left - 1 &&
  inner.top >= outer.top - 1 &&
  inner.right <= outer.right + 1 &&
  inner.bottom <= outer.bottom + 1

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 1 &&
  b.left < a.right - 1 &&
  a.top < b.bottom - 1 &&
  b.top < a.bottom - 1

test.describe("Settings' bar of pages fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of SIZES) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(SETTINGS_BAR_FIXTURE), { waitUntil: "load" })
      const bar = page.getByRole("navigation", { name: "Settings pages" })
      await expect(bar).toBeVisible()
      expect(errors, errors.join("\n")).toEqual([])

      const at = await measure(page)
      // A phone on its side gets the rail; upright, the bar along the bottom.
      expect(at.rail, "rail").toBe(phone.height < 480)
      expect(at.tabs.map((tab) => tab.name)).toEqual([
        "Running",
        "Phone",
        "Home",
        "My data",
        "More",
      ])
      expect(inside(at.bar, at.screen), "the bar leaves the screen").toBe(true)
      expect(at.barCutX, "the bar is wider than it is").toBeLessThanOrEqual(1)
      expect(at.barCutY, "the bar is taller than it is").toBeLessThanOrEqual(1)
      for (const [index, tab] of at.tabs.entries()) {
        expect(inside(tab.box, at.bar), `${tab.name} leaves the bar`).toBe(true)
        expect(tab.cutX, `${tab.name}'s label is cut`).toBeLessThanOrEqual(1)
        expect(tab.cutY, `${tab.name} is cut`).toBeLessThanOrEqual(1)
        for (const other of at.tabs.slice(index + 1)) {
          expect(
            overlap(tab.box, other.box),
            `${tab.name} overlaps ${other.name}`
          ).toBe(false)
        }
      }

      await page.getByRole("button", { name: "More" }).click()
      const more = page.getByRole("dialog", { name: "More" })
      await expect(more).toBeVisible()
      const appearance = more.getByRole("link", { name: /^Appearance/ })
      await expect(appearance).toBeInViewport({ ratio: 1 })
      await appearance.click()
      await expect(more).toBeHidden()
    })
  }
})
