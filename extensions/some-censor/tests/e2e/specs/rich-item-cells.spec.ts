/**
 * BOYO — the home feed's polymorphic grid cell (#1422, [ORP1])
 *
 * `ytd-rich-item-renderer` wraps whatever the feed item is: a video, but also
 * an ad slot, a Shorts shelf, a community post. It used to be catalogued as a
 * plain video tag, so a non-video cell was occluded by the pre-mask rule,
 * could never produce a videoId, and was never released — a permanently
 * blurred, permanently unclickable tile — while keeping the retry loop alive
 * for the life of the tab.
 *
 * O1 — A non-video cell is neither adopted nor left under the occluder.
 * O2 — A video cell is still pre-masked at first paint: the guard that fixes
 *      O1 must not open a window where a real card paints unoccluded.
 * O3 — The non-video cell does not keep the retry loop alive.
 */

import { expect, test } from "@censor/playwright/fixture"

const GRID_VIDEOS = ["vid_aaa111", "vid_bbb222", "vid_ccc333"] as const

test("O1: a non-video rich-item cell is neither masked nor left blurred", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Wait for the real cards to settle, so this is "the extension has run and
  // chose not to take it", not "the extension has not got there yet".
  await fixture.pollDebug(
    page,
    (d) => GRID_VIDEOS.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "ad-slot-card"),
    "an ad cell must not be adopted"
  ).toBe(false)

  expect(
    await fixture.fixtureCall<boolean>(page, "isPreMasked", "ad-slot-card"),
    "…and must not be left under the pre-mask occluder either"
  ).toBe(false)

  // Rendered, not inferred: the occluder's own `pointer-events: none` is what
  // made the reported tile unclickable.
  const pointerEvents = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("ad-slot-card")!).pointerEvents
  )
  expect(pointerEvents, "the cell still takes pointer events").not.toBe("none")
})

test("O2: a video rich-item cell IS pre-masked before its veil arrives", async ({
  fixture,
}) => {
  // The other side of the same guard: `:has()` on this tag must not be so
  // narrow that it stops protecting real cards. Once the veil is up the static
  // filter is lifted by [data-boyo], so this asserts the rule matches the
  // element rather than sampling a race — the same shape as L2.
  const page = await fixture.goto("yt-home")
  const matches = await page.evaluate(() =>
    document
      .querySelector(
        'ytd-rich-item-renderer:has(a[href*="/watch?v=vid_aaa111"])'
      )
      ?.matches(
        'ytd-rich-item-renderer:has(a[href*="/watch"], a[href*="/shorts/"])'
      )
  )
  expect(matches).toBe(true)
})

test("O3: the non-video cell does not keep the retry loop alive", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // The ad cell can never resolve. It used to be retried at 500ms forever,
  // each pass re-scanning the whole document. The budget is ~10s, so by 15s
  // the queue must have drained with the cell released from it.
  const snap = await fixture.pollDebug(page, (d) => d.unresolved === 0, {
    timeout: 15_000,
  })
  expect(snap.unresolved).toBe(0)
  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "ad-slot-card"),
    "released, not adopted"
  ).toBe(false)
})
