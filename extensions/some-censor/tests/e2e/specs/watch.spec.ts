/**
 * BOYO — the watch page (#1805)
 *
 * W1 — No comment, comment count or comments panel renders while the
 *      extension is on; another engagement panel stays, and off is plain
 *      YouTube.
 */

import { SWITCHED_OFF_ATTRIBUTE } from "@censor/lib/content/selectors"
import { expect, test } from "@censor/playwright/fixture"

test("W1: no comments render, unless off", async ({ fixture }) => {
  const page = await fixture.goto("yt-comments")
  const comments = page.locator("[data-comments]")
  await expect(comments).toHaveCount(4)
  for (const el of await comments.all()) await expect(el).toBeHidden()
  await expect(page.locator("#description-panel")).toBeVisible()

  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  for (const el of await comments.all()) await expect(el).toBeVisible()
})
