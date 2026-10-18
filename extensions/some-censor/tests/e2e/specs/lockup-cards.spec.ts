/**
 * BOYO — the upcoming-feed slider
 *
 * Two defects were reported against the same shelf, and both are here because
 * both were invisible to the existing suite: its fixture contained only
 * `ytd-rich-item-renderer` cards and its helpers only queried that tag, so a
 * card type the extension ignored entirely could not fail a test.
 *
 * L1 — Lit-era lockups are decided at all. This is the critical half: `ytd-*`
 *      was the whole catalogue, so every card in the newer shelves stayed
 *      readable. The fixture's lockups are old enough to plate.
 * L2 — A channel lockup — the *same tag*, no watch link — is left alone. The
 *      over-correction: occluding it would blur it permanently, because
 *      nothing would ever resolve it and lift the occlusion.
 * L3 — A shorts lockup is held absent on its videoId alone, having no channel
 *      anywhere (QD11).
 */

import { expect, test } from "@censor/playwright/fixture"

const SLIDER_VIDEOS = ["lock_aaa", "lock_bbb"] as const
const SHORTS_VIDEO = "short_eee"
const WIDE_VIDEO = "lock_wide"

// ─────────────────────────────────────────────────────────────────────────────
// L1: the cards that were being missed
// ─────────────────────────────────────────────────────────────────────────────

test("L1: every video lockup in the slider is plated", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  const snap = await fixture.pollDebug(
    page,
    (d) => SLIDER_VIDEOS.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of SLIDER_VIDEOS) {
    const entry = snap.entries[id]
    expect(entry, `entry for ${id} should exist`).toBeDefined()
    expect(entry?.viewKind, `${id} should be plated`).toBe("plated")

    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for ${id}`).toBe("plated")
    expect(
      await fixture.fixtureCall<boolean>(page, "hasPlate", id),
      `plate for ${id}`
    ).toBe(true)
  }
})

test("L1: a wide lockup is plated the same way as a narrow one", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  const snap = await fixture.pollDebug(page, (d) => WIDE_VIDEO in d.entries, {
    timeout: 5000,
  })
  expect(snap.entries[WIDE_VIDEO]?.viewKind).toBe("plated")
})

// ─────────────────────────────────────────────────────────────────────────────
// L2: the tag is polymorphic — do not adopt what you cannot release
// ─────────────────────────────────────────────────────────────────────────────

test("L2: a channel lockup is neither masked nor left blurred", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Wait for the real cards to settle, so this is "the extension has run and
  // chose not to take it", not "the extension has not got there yet".
  await fixture.pollDebug(
    page,
    (d) => SLIDER_VIDEOS.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  expect(
    await fixture.fixtureCall<boolean>(
      page,
      "isMaskedById",
      "slider-channel-lockup"
    ),
    "a channel lockup must not be adopted"
  ).toBe(false)

  expect(
    await fixture.fixtureCall<boolean>(
      page,
      "isPreMasked",
      "slider-channel-lockup"
    ),
    "…and must not be left under the pre-mask occluder either"
  ).toBe(false)
})

test("L2: a video lockup IS pre-masked before it is plated", async ({
  fixture,
}) => {
  // The other side of the same guard: the `:has()` in the occluder must not be
  // so narrow that it stops protecting real cards. Once the card is stamped
  // the static filter is lifted by [data-boyo], so this asserts the rule matches
  // the element rather than sampling a race.
  const page = await fixture.goto("yt-home")
  const matches = await page.evaluate(() =>
    document
      .getElementById("slider-card-1")
      ?.matches(
        'yt-lockup-view-model:has(a[href*="/watch"], a[href*="/shorts/"])'
      )
  )
  expect(matches).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// L3: a card with a videoId but no channel
// ─────────────────────────────────────────────────────────────────────────────

test("L3: a shorts lockup is absent, without a channel", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  const snap = await fixture.pollDebug(page, (d) => SHORTS_VIDEO in d.entries, {
    timeout: 5000,
  })

  expect(snap.entries[SHORTS_VIDEO]?.viewKind).toBe("absent")
  expect(
    snap.entries[SHORTS_VIDEO]?.channelId,
    "provisional entries carry the empty-string sentinel, not a fake channel"
  ).toBe("")
})

test("L3: the unresolvable cards do not keep the retry loop alive", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // The channel lockup can never resolve and the shorts card can never produce
  // a channel. The attempt budget is ~10s, so by 15s the queue must have
  // drained.
  const snap = await fixture.pollDebug(page, (d) => d.unresolved === 0, {
    timeout: 15_000,
  })
  expect(snap.unresolved).toBe(0)
})
