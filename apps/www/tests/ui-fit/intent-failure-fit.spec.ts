/**
 * Does a refused press leave every button where it was? (IB1.)
 *
 * On 2026-10-30, Practice Home's "Pick a portion" failed with "That request
 * couldn't be completed." and jumped: the failure widened its slot past the
 * row, so it wrapped to a line of its own and sat at that line's far end.
 * jsdom has no layout, so this measures the `intent-failure` fixture
 * (`./panel-page/intent-failure.tsx`): Practice Home's row with each of its
 * two buttons idle or refused, at the phone's sizes (Practice Home is the
 * phone's). Every button must keep, relative to its row, the box it has in
 * the idle row, and every failure must sit below both buttons, inside the row.
 *
 * Promise IB1.
 * - Claim: in a wrapping row of `IntentButton`s that sets `failureOwnLine`,
 *   a failure moves no button, and shows below them all, inside the row.
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

import {
  INTENT_FAILURE_FIXTURE,
  PHONE_VIEWPORTS,
  servePanelPage,
} from "./harness"

const PAGE = servePanelPage()

const ROWS = ["menu-failed", "next-failed", "both-failed"] as const
const BUTTONS = ["Next lesson", "Pick a portion"] as const

type Box = { x: number; y: number; width: number; height: number }

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

const same = (a: Box, b: Box): boolean =>
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5

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
        const frame = page.locator(`[data-row="${row}"]`)
        const rowBox = await boxOf(frame)
        let lowest = 0
        for (const button of BUTTONS) {
          const idle = await placed(page, "idle", button)
          const now = await placed(page, row, button)
          if (!same(idle, now)) {
            failures.push(
              `${row}: "${button}" moved from ${JSON.stringify(idle)} to ${JSON.stringify(now)}`
            )
          }
          lowest = Math.max(lowest, rowBox.y + now.y + now.height)
        }
        for (const alert of await frame.getByRole("alert").all()) {
          const box = await boxOf(alert)
          if (box.y < lowest - 0.5) {
            failures.push(`${row}: a failure sits beside a button, not below`)
          }
          if (
            box.x < rowBox.x - 0.5 ||
            box.x + box.width > rowBox.x + rowBox.width + 0.5
          ) {
            failures.push(`${row}: a failure leaves its row`)
          }
        }
      }

      await testInfo.attach(`intent-failure-${phone.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      })
      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
