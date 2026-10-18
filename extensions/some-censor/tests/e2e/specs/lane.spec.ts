/**
 * BOYO — the listening lane (#1806, QD15)
 *
 * LN1 — Music, by any of its signals, is shown whole at any age: its real
 *      thumbnail and channel photo are painted.
 * LN2 — Live music, a Short, and a recent video with no music sign are held.
 * LN3 — The crowd still goes: a whole card's view count is not shown.
 */

import { expect, test } from "@censor/playwright/fixture"
import type { Locator } from "@playwright/test"

/** Whether an image is painted: rendered, with a box, and not hidden. */
async function painted(img: Locator): Promise<boolean> {
  return img.evaluate((el) => {
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return (
      style.visibility === "visible" &&
      style.display !== "none" &&
      box.width > 0 &&
      box.height > 0
    )
  })
}

test("LN1: music is shown whole, with its own images, at any age", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-lane")
  for (const id of ["ost", "topic", "artist", "lockup"]) {
    const card = page.locator(`#${id}`)
    await expect(card, id).toHaveAttribute("data-boyo", "whole")
    expect(await painted(card.locator("img.thumb")), `${id} thumbnail`).toBe(
      true
    )
    expect(await painted(card.locator("img.photo")), `${id} photo`).toBe(true)
  }
})

test("LN2: live music, a Short and a recent vlog are held", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-lane")
  for (const id of ["live", "short", "vlog"]) {
    await expect(page.locator(`#${id}`), id).toHaveAttribute(
      "data-boyo",
      "absent"
    )
    await expect(page.locator(`#${id}`), id).toBeHidden()
  }
})

test("LN3: a whole card's view count still goes", async ({ fixture }) => {
  const page = await fixture.goto("yt-lane")
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "whole")
  await expect(page.locator('#ost [data-crowd="views"]')).toBeHidden()
})
