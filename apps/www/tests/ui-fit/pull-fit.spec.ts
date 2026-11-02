/**
 * Does the drag-down indicator fit the phone? (PULL0, #2457.)
 *
 * The indicator (`src/components/pull-to-check.tsx`) is the phone's alone, so
 * it is swept on the phone page (`./phone-page`, built under the Android
 * app's profile) at the phone's sizes (`PHONE_VIEWPORTS`, 780x390 among
 * them), in each phase it shows something (`./phone-page/pull.tsx`). Each
 * must leave the page as it was (the measure the panel sweep uses), keep its
 * words on one line, and sit inside the phone across; at rest (armed,
 * checking, done, failed, offline) it shows whole inside the page body,
 * below the header. Pulling, it is still coming down from under the header,
 * and the body clips what has not come down yet.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/pull-fit.spec.ts
 */

import { expect, test } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  servePhonePage,
} from "./harness"
import type { PullId } from "./phone-page/pull"

const PAGE = servePhonePage()

/** Each phase, and whether the indicator is at rest in it. */
const PHASES = {
  "pull-pulling": false,
  "pull-armed": true,
  "pull-checking": true,
  "pull-done": true,
  "pull-failed": true,
  "pull-offline": true,
} as const satisfies Record<PullId, boolean>

test.describe("the drag-down indicator fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    for (const [fixture, atRest] of Object.entries(PHASES)) {
      test(`${fixture} at ${phone.name} (${phone.width}x${phone.height})`, async ({
        page,
      }) => {
        PAGE.expectBuilt()
        await page.setViewportSize({ width: phone.width, height: phone.height })
        const errors: Array<string> = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.goto(PAGE.url(fixture), { waitUntil: "load" })

        const pill = page.getByRole("status").locator("p")
        await expect(pill).toHaveText(/\S/)
        expect(errors, errors.join("\n")).toEqual([])

        const { mounted, violations } = await findViolations(page)
        expect(mounted).toBe(true)
        expect(
          violations.map((violation) => describeViolation(fixture, violation))
        ).toEqual([])

        const fit = await page.evaluate(() => {
          const p = document.querySelector<HTMLElement>("[role=status] p")!
          const words = p.querySelector("span")!
          const body = document.querySelector<HTMLElement>(
            "[data-scroll-intent=page]"
          )!
          const box = p.getBoundingClientRect()
          const room = body.getBoundingClientRect()
          return {
            // The words are a flex item, one box however many lines it
            // holds: count them by height.
            lines: Math.round(
              words.getBoundingClientRect().height /
                parseFloat(getComputedStyle(words).lineHeight)
            ),
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            roomTop: room.top,
            roomBottom: room.bottom,
            width: window.innerWidth,
            pageWidth: document.documentElement.scrollWidth,
          }
        })

        expect(fit.lines, "the words wrap").toBe(1)
        expect(fit.left).toBeGreaterThanOrEqual(0)
        expect(fit.right).toBeLessThanOrEqual(fit.width)
        expect(fit.pageWidth).toBeLessThanOrEqual(fit.width)
        if (atRest) {
          expect(fit.top).toBeGreaterThanOrEqual(fit.roomTop)
          expect(fit.bottom).toBeLessThanOrEqual(fit.roomBottom)
        }
      })
    }
  }
})
