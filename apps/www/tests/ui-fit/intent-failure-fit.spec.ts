/**
 * jsdom has no layout, so this measures the `intent-failure` fixture
 * (`./panel-page/intent-failure.tsx`) at the phone's sizes.
 *
 * Promise IB1.
 * - Claim: in a wrapping row of `IntentButton`s (`bare`), a failure moves no
 *   button, and is said on the notice plane over the screen, never in the
 *   row (HS1).
 * - Family: which of the row's buttons failed (none, either, both), at each
 *   phone size, the phone held sideways among them.
 * - Proof: this spec, which enumerates both.
 * - Tolerance: a retryable failure relabels its button "Try again", which
 *   may change its width; this fixture's failure is not retryable.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/intent-failure-fit.spec.ts
 */

import { expect, test, type Locator, type Page } from "@playwright/test"
import { moved, type Box } from "@tests/layout-invariants/stays-put"

import {
  INTENT_FAILURE_FIXTURE,
  PHONE_VIEWPORTS,
  servePanelPage,
} from "./harness"

const PAGE = servePanelPage()

const ROWS = ["menu-failed", "next-failed", "both-failed"] as const
const BUTTONS = ["Next lesson", "Pick a portion"] as const

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error("no box")
  return box
}

/** `button`'s box in `row`, from the row's top-left corner. */
async function placed(page: Page, row: string, button: string): Promise<Box> {
  const frame = page.locator(`[data-row="${row}"]`)
  const at = await boxOf(frame)
  const box = await boxOf(frame.getByRole("button", { name: button }))
  return { ...box, x: box.x - at.x, y: box.y - at.y }
}

test.describe("a refused press moves no button", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }, testInfo) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(INTENT_FAILURE_FIXTURE), { waitUntil: "load" })
      await expect(page.locator("[data-row]")).toHaveCount(ROWS.length + 1)
      expect(errors, errors.join("\n")).toEqual([])

      const failures: Array<string> = []
      for (const row of ROWS) {
        for (const button of BUTTONS) {
          const idle = await placed(page, "idle", button)
          const now = await placed(page, row, button)
          if (moved(idle, now)) {
            failures.push(
              `${row}: "${button}" moved from ${JSON.stringify(idle)} to ${JSON.stringify(now)}`
            )
          }
        }
        if (
          (await page.locator(`[data-row="${row}"] [role=alert]`).count()) > 0
        ) {
          failures.push(`${row}: a failure is said in the row`)
        }
      }
      // One per refused button: menu, next, and both of the last row.
      await expect(
        page.locator("[data-notice-plane] [role=alert]")
      ).toHaveCount(4)

      await testInfo.attach(`intent-failure-${phone.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      })
      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
