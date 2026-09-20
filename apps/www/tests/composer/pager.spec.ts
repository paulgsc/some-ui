/**
 * The composer's step-1 pager, driven in a real browser.
 *
 * #1287 fixed the picker overflowing its box at phone widths and, in doing
 * so, exposed the defect this file exists for: pressing "Next" on the last
 * page flashed that page and landed back on the first one. The cause was in
 * `useFittedPage` - the last page holds fewer items than a page, so its spare
 * space is the *list* running out rather than room for more per page; reading
 * it as room grew `perPage`, collapsed `pageCount` to 1, and clamped the page
 * index back to 0.
 *
 * That defect had a clear run past every existing gate, and the reason is
 * worth stating: no test in this repository had ever clicked that button.
 * `tests/ui-fit` sweeps a built Storybook, `launcher-fit.spec.ts` mirrors the
 * shipped classes in hand-written HTML rather than mounting the component,
 * and the hook's own unit tests drive a fake ResizeObserver. All three are
 * good at what they measure and none of them can see a pager that does not
 * page.
 *
 * So these assert behaviour, at three viewports chosen for the shapes they
 * probe rather than for device names - and one of them is landscape, because
 * an orientation that is never rendered is an orientation nothing can fail
 * on.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { BASE_URL, startAppServer, stopAppServer } from "./harness"

/**
 * Portrait phone, landscape phone, laptop. The landscape entry is the one
 * that keeps this honest: it is where the window's scarce axis is height,
 * where every width breakpoint below `md` reads as "roomy", and where the
 * composer's own chrome most nearly exceeds what it is drawn in.
 */
const VIEWPORTS = [
  { name: "phone-portrait", width: 390, height: 780 },
  { name: "phone-landscape", width: 780, height: 390 },
  { name: "laptop", width: 1280, height: 800 },
] as const

test.beforeAll(async () => {
  await startAppServer()
})

test.afterAll(() => {
  stopAppServer()
})

/** The app's auth is an in-memory stub; this is the whole of signing in. */
async function openComposer(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/sessions/new`, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: /passkey/i }).click()
  await page.waitForURL(/sessions\/new/)
  // Waits on the wizard's own nav rather than the step rail, so this spec can
  // be pointed at a build from before the rail existed and still fail for the
  // reason it is about.
  await expect(
    page.getByRole("button", { name: "Continue", exact: true })
  ).toBeVisible()
}

/** "2 / 4" -> { page: 2, pageCount: 4 }, or null when the list fits one page. */
async function readPager(
  page: Page
): Promise<{ page: number; pageCount: number } | null> {
  const label = page
    .locator('[aria-live="polite"]', { hasText: /^\d+ \/ \d+$/ })
    .first()
  if ((await label.count()) === 0) return null
  const match = /(\d+)\s*\/\s*(\d+)/.exec((await label.textContent()) ?? "")
  if (!match?.[1] || !match[2]) return null
  return { page: Number(match[1]), pageCount: Number(match[2]) }
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test("Next advances a page and stays there", async ({ page }) => {
      await openComposer(page)

      const before = await readPager(page)
      test.skip(
        before === null,
        "the catalogue fits one page at this viewport, so there is no pager to drive"
      )
      if (before === null) return

      await page
        .getByRole("button", { name: "Next page of activities" })
        .click()

      // Read it immediately, then again once the fit has had every chance to
      // settle. The bug lived in the gap between those two reads: the page
      // advanced, and a growth pass driven by the shorter last page then took
      // it back. Asserting only the settled value would pass against the old
      // code wherever the flash happened to be quick.
      expect((await readPager(page))?.page).toBe(before.page + 1)

      await page.waitForTimeout(1000)

      expect(
        (await readPager(page))?.page,
        "the fit re-measured after paging and moved the reader off the page they asked for"
      ).toBe(before.page + 1)
    })

    test("no page of the catalogue overflows the box it was given", async ({
      page,
    }) => {
      await openComposer(page)

      // Walk every page: `perPage` is one number for the whole list, so a
      // count that fits page 1 and overflows page 3 is still the wrong count.
      for (let guard = 0; guard < 12; guard += 1) {
        const measured = await page.evaluate(() => {
          const box = document.querySelector<HTMLElement>(
            '[data-scroll-intent="fitted-residue"]'
          )
          const content = box?.firstElementChild
          if (!box || !(content instanceof HTMLElement)) return null
          return { available: box.clientHeight, used: content.scrollHeight }
        })
        expect(measured).not.toBeNull()
        if (measured === null) return

        // A single item taller than the whole box is the hook's documented
        // `minPerPage` escape, and on a 390px-tall landscape window a card
        // really is taller than the share it gets. What must never happen is
        // a *multi-item* page overflowing: that is the fit being wrong,
        // rather than the box being small.
        const cards = await page.locator(".grid > button").count()
        if (cards > 1) {
          expect(
            measured.used,
            `a ${cards}-card page renders ${measured.used}px into a ${measured.available}px box`
          ).toBeLessThanOrEqual(measured.available + 1)
        }

        const next = page.getByRole("button", {
          name: "Next page of activities",
        })
        if ((await next.count()) === 0 || !(await next.isEnabled())) break
        await next.click()
        await page.waitForTimeout(400)
      }
    })

    test("the step rail walks the wizard the way Continue does", async ({
      page,
    }) => {
      await openComposer(page)

      // Steps 2-4 go through the same predicate Continue does, so with
      // nothing chosen the rail must refuse exactly where Continue refuses.
      await expect(
        page.getByRole("button", { name: /^Step 3:/ })
      ).toBeDisabled()
      await expect(
        page.getByRole("button", { name: "Continue", exact: true })
      ).toBeDisabled()

      await page.locator(".grid > button").first().click()

      await expect(page.getByRole("button", { name: /^Step 3:/ })).toBeEnabled()
      await page.getByRole("button", { name: /^Step 4:/ }).click()
      await expect(
        page.getByRole("button", { name: "Save & Play" })
      ).toBeVisible()

      // ...and goes back the way Back does, which is unconditional.
      await page.getByRole("button", { name: /^Step 1:/ }).click()
      await expect(
        page.getByRole("button", { name: "Continue", exact: true })
      ).toBeVisible()
    })

    test("every step fits the window instead of scrolling the page", async ({
      page,
    }) => {
      await openComposer(page)
      await page.locator(".grid > button").first().click()

      // Driven with Continue rather than the step rail: this is a property of
      // the wizard, not of the rail (which has its own test above), and
      // Continue is the one control that has always been there.
      for (const step of [2, 3, 4]) {
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click()
        await page.waitForTimeout(400)

        const doc = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))

        // The composer is a bounded surface (routes/_dashboard.tsx): its
        // chrome is meant to stay reachable while its body is worked, which
        // is only true if the page never scrolls out from under it. This is
        // also what tore the sidebar's background in landscape - a scrolling
        // document under viewport-fixed chrome.
        expect(
          doc.scrollHeight,
          `step ${step} scrolls the page vertically`
        ).toBeLessThanOrEqual(doc.clientHeight)
        expect(
          doc.scrollWidth,
          `step ${step} scrolls the page sideways`
        ).toBeLessThanOrEqual(doc.clientWidth)

        // Nothing may paint outside a box that never said it would clip or
        // scroll - the containment half of docs/ui-fit, measured on the real
        // route rather than on a mirrored fixture.
        const leaks = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main *")]
            .filter(
              (el) =>
                getComputedStyle(el).overflowY === "visible" &&
                el.clientHeight > 0 &&
                el.scrollHeight > el.clientHeight + 1
            )
            .map(
              (el) =>
                `${el.tagName}.${el.className} ${el.scrollHeight}>${el.clientHeight}`
            )
            .slice(0, 5)
        )
        expect(leaks, `step ${step} holds more content than it clips`).toEqual(
          []
        )
      }
    })
  })
}
