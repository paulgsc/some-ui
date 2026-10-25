/**
 * Does each Jobs card's pop-up fit the phone, close every way it should,
 * and hold its colors in every theme? (J0, JB2; RUN1's morning states.)
 *
 * jsdom can say none of it, so this walks the `jobs-status` fixture
 * (`./panel-page/jobs-status.tsx`): every state of the union, with the
 * longest words the table says, at the phone's sizes (`PHONE_VIEWPORTS`, the
 * phone held sideways among them; Jobs is a phone surface). For each state
 * it opens the pop-up and measures it against the window and its own box,
 * then closes it by a press elsewhere, by focus leaving it, and by Escape.
 * Last, under each session theme the app ships, each state's title must
 * read against its bar, and its icon against its chip.
 *
 * Screenshots of each state's pop-up land in the test's output directory.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/jobs-status-fit.spec.ts
 */

import { expect, test, type Locator, type Page } from "@playwright/test"
import { CONTRAST_FLOOR, SESSION_THEMES } from "@some-ui/styles/theme"

import { MORNING_IDS } from "@/lib/jobs/morning"
import { JOURNEY_IDS } from "@/lib/journey"

import { JOBS_STATUS_FIXTURE, PHONE_VIEWPORTS, servePanelPage } from "./harness"

const PAGE = servePanelPage()

/** Every bar the fixture draws: J0's journeys, then this morning's run (RUN1). */
const STATES: ReadonlyArray<string> = [...JOURNEY_IDS, ...MORNING_IDS]

test.describe.configure({ timeout: 3 * 60 * 1000 })

async function openFixture(page: Page): Promise<void> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(JOBS_STATUS_FIXTURE), { waitUntil: "load" })
  await expect(page.locator("[data-journey]")).toHaveCount(STATES.length)
  expect(errors, errors.join("\n")).toEqual([])
}

/** The pop-up open now: a closing one stays in the page while it fades. */
const popup = (page: Page): Locator =>
  page.locator('[data-journey-popup][data-state="open"]')

/** Presses `id`'s icon and waits for its pop-up to settle open. */
async function openState(page: Page, id: string): Promise<Locator> {
  const bar = page.locator(`[data-journey="${id}"]`)
  await bar.scrollIntoViewIfNeeded()
  await bar.getByRole("button").click()
  await expect(popup(page)).toBeVisible()
  // The opening zoom scales the box; measure it at rest.
  await page.waitForTimeout(250)
  return bar
}

test.describe("each Jobs card's pop-up fits the phone and closes", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }, testInfo) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await openFixture(page)
      const failures: Array<string> = []

      for (const id of STATES) {
        await openState(page, id)
        const box = await popup(page).boundingBox()
        if (box === null) throw new Error(`${id}: the pop-up has no box`)
        if (
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > phone.width + 0.5 ||
          box.y + box.height > phone.height + 0.5
        ) {
          failures.push(
            `${id}: the pop-up leaves the window (${JSON.stringify(box)})`
          )
        }
        // Nothing inside is wider than the box, nor drawn past its sides.
        const spill = await popup(page).evaluate((el) => {
          const outer = el.getBoundingClientRect()
          const wide = el.scrollWidth - el.clientWidth
          const past = [...el.querySelectorAll("*")]
            .map((child) => child.getBoundingClientRect())
            .filter(
              (r) =>
                r.width > 0 &&
                (r.left < outer.left - 0.5 || r.right > outer.right + 0.5)
            ).length
          return { wide, past }
        })
        if (spill.wide > 1 || spill.past > 0) {
          failures.push(
            `${id}: content spills sideways (${JSON.stringify(spill)})`
          )
        }
        await page.screenshot({
          path: testInfo.outputPath(`${phone.name}-${id}.png`),
        })

        // A press elsewhere: the pop-up keeps 16px off each edge, so the
        // window's corner is never under it.
        await page.mouse.click(4, 4)
        if ((await popup(page).count()) > 0) {
          failures.push(`${id}: a press elsewhere left the pop-up open`)
          await page.keyboard.press("Escape")
        }
      }

      // Focus leaving it, and Escape, on one state each.
      await openState(page, "missed-run")
      await page.locator("[data-fit-elsewhere]").focus()
      if ((await popup(page).count()) > 0) {
        failures.push("focus leaving the pop-up left it open")
        await page.keyboard.press("Escape")
      }
      await openState(page, "with-home")
      await page.keyboard.press("Escape")
      if ((await popup(page).count()) > 0) {
        failures.push("Escape left the pop-up open")
      }

      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})

/** WCAG's contrast ratio between two sRGB colors. */
function contrast(a: Rgb, b: Rgb): number {
  const lum = ([r, g, b2]: Rgb): number => {
    const lin = (c: number): number => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b2)
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

type Rgb = readonly [number, number, number]

type Painted = {
  id: string
  title: Rgb
  bar: Rgb
  icon: Rgb
  chip: Rgb
}

/**
 * Each bar's title and icon colors and what they sit on, as a canvas paints
 * them: the page's background, then the bar's tint over it.
 */
function paint(page: Page): Promise<ReadonlyArray<Painted>> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (ctx === null) throw new Error("no canvas")
    const pixel = (...layers: Array<string>): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      for (const fill of layers) {
        ctx.fillStyle = fill
        ctx.fillRect(0, 0, 1, 1)
      }
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const ground = getComputedStyle(document.body).backgroundColor
    return [...document.querySelectorAll<HTMLElement>("[data-journey]")].map(
      (bar) => {
        const heading = bar.querySelector("h2, h3")
        const chip = bar.querySelector<HTMLElement>("[data-journey-chip]")
        if (heading === null || chip === null) throw new Error("no bar parts")
        const barFill = getComputedStyle(bar).backgroundColor
        const chipFill = getComputedStyle(chip).backgroundColor
        return {
          id: bar.dataset["journey"] ?? "",
          title: pixel(ground, barFill, getComputedStyle(heading).color),
          bar: pixel(ground, barFill),
          icon: pixel(ground, barFill, chipFill, getComputedStyle(chip).color),
          chip: pixel(ground, barFill, chipFill),
        }
      }
    )
  })
}

test.describe("each state's colors hold in every theme", () => {
  PAGE.skipUnbuilt()

  test("titles read against their bars, and icons against their chips", async ({
    page,
  }) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 412, height: 915 })
    await openFixture(page)
    const failures: Array<string> = []
    for (const theme of SESSION_THEMES) {
      // As the session controller does: the theme's classes on the root.
      await page.evaluate((classes) => {
        document.documentElement.className = classes.join(" ")
      }, theme.boundary.classNames)
      // The bar's color moves over 200ms; read it once it has.
      await page.waitForTimeout(300)
      for (const p of await paint(page)) {
        const text = contrast(p.title, p.bar)
        const icon = contrast(p.icon, p.chip)
        if (text < CONTRAST_FLOOR.text) {
          failures.push(`${theme.id} ${p.id}: title ${text.toFixed(2)}:1`)
        }
        if (icon < CONTRAST_FLOOR.mark) {
          failures.push(`${theme.id} ${p.id}: icon ${icon.toFixed(2)}:1`)
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([])
  })
})
