/**
 * BOYO — the listening lane (#1806, QD15)
 *
 * LN1 — Music, by any of its signals, is shown whole at any age: its real
 *      thumbnail and channel photo are on screen (QC7: read off the pixels).
 * LN2 — Live music, a Short, and a recent video with no music sign are held.
 * LN3 — The crowd still goes: a whole card's view count is not shown.
 * LN4 — Strict reads only the channel's signs: a title token alone shows
 *      nothing of the video, and a Topic channel or the artist badge still
 *      shows it whole; Standard shows the first whole again (#1966).
 */

import { expect, test } from "@censor/playwright/fixture"
import { vividPixels } from "@censor/playwright/rendered"

test("LN1: music is shown whole, with its own images, at any age", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-lane")
  for (const id of ["ost", "topic", "artist", "lockup"]) {
    const card = page.locator(`#${id}`)
    await expect(card, id).toHaveAttribute("data-boyo", "whole")
    for (const img of ["thumb", "photo"]) {
      expect(
        await vividPixels(card.locator(`img.${img}`)),
        `${id} ${img}`
      ).toBeGreaterThan(0)
    }
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

test("LN4: Strict shows music whole by its channel's signs alone", async ({
  fixture,
}) => {
  await fixture.settings({ mode: "strict" })
  const page = await fixture.goto("yt-lane")
  // "[MV] … OST", three days old, from a channel with no sign: held.
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "absent")
  expect(await vividPixels(page.locator("#ost img.thumb"))).toBe(0)
  for (const id of ["topic", "artist"]) {
    await expect(page.locator(`#${id}`), id).toHaveAttribute(
      "data-boyo",
      "whole"
    )
    expect(
      await vividPixels(page.locator(`#${id} img.thumb`)),
      id
    ).toBeGreaterThan(0)
  }

  await fixture.settings({ mode: "standard" })
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "whole")
  expect(await vividPixels(page.locator("#ost img.thumb"))).toBeGreaterThan(0)
})
