/**
 * Does the drag-down indicator fit the phone? (PULL0, #2457.)
 *
 * The indicator (`src/components/pull-to-check.tsx`) is the phone's alone, so
 * it is swept on the phone page (`./phone-page`, built under the Android
 * app's profile) at the phone's sizes (`PHONE_VIEWPORTS`, 780x390 among
 * them), in each phase it shows something (`./phone-page/pull.tsx`). Each
 * must leave the page as it was (the measure the panel sweep uses), keep its
 * words on one line (two for a failure that names what), and sit inside the
 * phone across. Armed, the pill rests whole inside the page body, below the
 * header; pulling, it is still coming down from under the header, and the
 * body clips what has not come down yet. Once let go (checking, done,
 * failed, offline), how it went is a notice.
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

/**
 * Each phase, and where it is said: on the pill still coming down, on the
 * pill at rest, or in a notice.
 */
const PHASES = {
  "pull-pulling": "coming",
  "pull-armed": "rest",
  "pull-checking": "notice",
  "pull-done": "notice",
  "pull-failed": "notice",
  "pull-failed-named": "notice",
  "pull-offline": "notice",
} as const satisfies Record<PullId, "coming" | "rest" | "notice">

test.describe("the drag-down indicator fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    for (const [fixture, where] of Object.entries(PHASES)) {
      test(`${fixture} at ${phone.name} (${phone.width}x${phone.height})`, async ({
        page,
      }) => {
        PAGE.expectBuilt()
        await page.setViewportSize({ width: phone.width, height: phone.height })
        const errors: Array<string> = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.goto(PAGE.url(fixture), { waitUntil: "load" })

        const said = page.locator("[data-pull-words]")
        await expect(said).toHaveText(/\S/)
        expect(errors, errors.join("\n")).toEqual([])

        const { mounted, violations } = await findViolations(page)
        expect(mounted).toBe(true)
        expect(
          violations.map((violation) => describeViolation(fixture, violation))
        ).toEqual([])

        const fit = await page.evaluate(() => {
          const p = document.querySelector<HTMLElement>("[data-pull-words]")!
          const words = p.querySelector("span:last-child")!
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

        // One line, but a failure that names what it could not read may
        // take two on a narrow phone.
        expect(fit.lines, "the words wrap").toBeLessThanOrEqual(
          fixture === "pull-failed-named" ? 2 : 1
        )
        expect(fit.left).toBeGreaterThanOrEqual(0)
        expect(fit.right).toBeLessThanOrEqual(fit.width)
        expect(fit.pageWidth).toBeLessThanOrEqual(fit.width)
        if (where === "rest") {
          expect(fit.top).toBeGreaterThanOrEqual(fit.roomTop)
          expect(fit.bottom).toBeLessThanOrEqual(fit.roomBottom)
        }
      })
    }
  }
})
