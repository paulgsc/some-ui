/**
 * The composer on a phone, driven in a real browser.
 *
 * Two things here could not be seen by anything that came before.
 *
 * **The fit flickered.** On a phone-width window the picker's scrollbar came
 * and went every frame, forever: a count that overflowed brought a scrollbar,
 * whose width changed the box, which the fit read as a different window and
 * so forgot it had rejected that count. `Configure` did the same through its
 * pager instead - one page per card brings a pager, which takes height from
 * the box. Both are `useFittedPage` taking its own probing for evidence, and
 * both only happen in a browser that lays scrollbars out, which is why this
 * file launches Chromium *without* `--hide-scrollbars`: Playwright's headless
 * default paints none, and a spec that cannot see a scrollbar cannot see that.
 *
 * **Scrollbars on a phone.** They are a desktop affordance - on a touchscreen
 * you scroll by finger and a bar is only noise - so below `md` none is
 * painted, and the box is exactly as wide with content overflowing as without.
 *
 * The shape itself - one concern per pane, switched by a bottom tab bar, as in
 * the lesson route - is asserted alongside, at the sizes a phone comes in.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { signIn, startAppServer, stopAppServer } from "./harness"

test.use({
  launchOptions: {
    ignoreDefaultArgs: ["--hide-scrollbars"],
    ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {}),
  },
})

/** Tall and short, narrow and not: the sizes a phone comes in. */
const PHONES = [
  { name: "tall", width: 390, height: 780 },
  { name: "medium", width: 390, height: 640 },
  { name: "compact", width: 360, height: 560 },
  { name: "small", width: 320, height: 480 },
] as const

const PANES = ["Browse", "Added", "Configure", "Arrange", "Review"] as const

test.beforeAll(async () => {
  await startAppServer()
})

test.afterAll(() => {
  stopAppServer()
})

function tab(
  page: Page,
  name: (typeof PANES)[number]
): ReturnType<Page["getByRole"]> {
  return page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) })
}

/** Adds the first two catalogue cards - enough to open every other pane. */
async function addTwoActivities(page: Page): Promise<void> {
  const cards = page.locator("#composer-pane-browse .grid > button")
  await cards.nth(0).click()
  await page.waitForTimeout(100)
  await cards.nth(0).click()
}

/**
 * Every distinct reading of the fitted boxes that are on screen, over about a
 * second of frames. A fit that has settled reads the same in all of them; one
 * that is still flipping between two counts reads differently in nearly every
 * frame, and the list says how many ways.
 */
async function distinctReadings(page: Page): Promise<Array<string>> {
  return page.evaluate(
    () =>
      new Promise<Array<string>>((resolve) => {
        const seen = new Set<string>()
        const start = performance.now()
        const tick = (): void => {
          const boxes = [
            ...document.querySelectorAll<HTMLElement>("[data-scroll-intent]"),
          ].filter((box) => box.clientHeight > 0)
          seen.add(
            JSON.stringify(
              boxes.map((box) => ({
                width: box.offsetWidth,
                client: box.clientWidth,
                height: box.clientHeight,
                used: box.scrollHeight,
                items: box.firstElementChild?.children.length ?? -1,
              }))
            )
          )
          if (performance.now() - start < 1000) requestAnimationFrame(tick)
          else resolve([...seen])
        }
        requestAnimationFrame(tick)
      })
  )
}

for (const phone of PHONES) {
  test.describe(`${phone.name} phone (${phone.width}x${phone.height})`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } })

    test("is a bar of tabs, one pane each, and not a wizard", async ({
      page,
    }) => {
      await signIn(page)

      await expect(page.getByRole("tab")).toHaveText([...PANES])
      await expect(
        page.getByRole("button", { name: "Continue", exact: true })
      ).toHaveCount(0)

      // Step 1's two halves are reachable; the rest need something chosen,
      // exactly where the wide layout's rail refuses.
      await expect(tab(page, "Browse")).toBeEnabled()
      await expect(tab(page, "Added")).toBeEnabled()
      await expect(tab(page, "Configure")).toBeDisabled()
      await expect(tab(page, "Review")).toBeDisabled()

      await addTwoActivities(page)
      await expect(page.getByRole("tab", { name: "Added, 2" })).toBeEnabled()
      await expect(tab(page, "Review")).toBeEnabled()

      // The last pane is where a session is finished.
      await tab(page, "Review").click()
      await expect(
        page.getByRole("button", { name: "Save & Play" })
      ).toBeVisible()
    })

    test("every pane holds still, and paints no scrollbar", async ({
      page,
    }) => {
      // Five panes, each given time to settle and then a second of frames.
      test.setTimeout(45_000)
      await signIn(page)
      await addTwoActivities(page)

      for (const pane of PANES) {
        await tab(page, pane).click()
        // Long enough for a fit that is going to settle to have done so.
        await page.waitForTimeout(600)

        const readings = await distinctReadings(page)
        expect(
          readings,
          `${pane}: the fitted box kept changing between frames`
        ).toHaveLength(1)

        const barWidth = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("[data-scroll-intent]")]
            .filter((box) => box.clientHeight > 0)
            .map((box) => box.offsetWidth - box.clientWidth)
        )
        expect(
          barWidth.every((width) => width === 0),
          `${pane}: a scrollbar is taking width from the box`
        ).toBe(true)

        const doc = await page.evaluate(() => ({
          down:
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
          across:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        }))
        expect(
          doc.down,
          `${pane} scrolls the page vertically`
        ).toBeLessThanOrEqual(0)
        expect(
          doc.across,
          `${pane} scrolls the page sideways`
        ).toBeLessThanOrEqual(0)
      }
    })

    test("keeps the tab bar inside the window", async ({ page }) => {
      await signIn(page)

      const bar = await page.locator("[data-shown]").boundingBox()
      expect(bar).not.toBeNull()
      if (bar === null) return
      expect(bar.y + bar.height).toBeLessThanOrEqual(phone.height)
      expect(bar.x).toBeGreaterThanOrEqual(0)
      expect(bar.x + bar.width).toBeLessThanOrEqual(phone.width)
    })
  })
}

test.describe("the tab bar gets out of the way", () => {
  test.use({ viewport: { width: 390, height: 640 } })

  test("tucks away while a pane scrolls down and returns on the way up", async ({
    page,
  }) => {
    await signIn(page)
    await addTwoActivities(page)
    await tab(page, "Arrange").click()
    // The advanced timeline is the one pane that really scrolls.
    await page.getByRole("switch").click()

    const editor = page.locator('[data-scroll-intent="editor"]')
    const bar = page.locator("[data-shown]")
    await expect(bar).toHaveAttribute("data-shown", "true")

    await editor.evaluate((box) => {
      box.scrollTop = 150
    })
    await expect(bar).toHaveAttribute("data-shown", "false")

    await editor.evaluate((box) => {
      box.scrollTop = 60
    })
    await expect(bar).toHaveAttribute("data-shown", "true")
  })
})
