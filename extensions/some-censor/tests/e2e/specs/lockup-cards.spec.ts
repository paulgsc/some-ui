/**
 * BOYO — the upcoming-feed slider (#973)
 *
 * Two defects were reported against the same shelf, and both are here because
 * both were invisible to the existing suite: its fixture contained only
 * `ytd-rich-item-renderer` cards and its helpers only queried that tag, so a
 * card type the extension ignored entirely could not fail a test.
 *
 * L1 — Lit-era lockups mask at all. This is the critical half: `ytd-*` was the
 *      whole catalogue, so every card in the newer shelves stayed readable.
 * L2 — A channel lockup — the *same tag*, no watch link — is left alone. The
 *      over-correction: occluding it would blur it permanently, because
 *      nothing would ever resolve it and lift the occlusion.
 * L3 — A shorts lockup masks on its videoId alone, having no channel anywhere.
 * L4 — Nothing the veil paints escapes the card, at 168px.
 * L5 — A card too narrow for the full meta renders reduced meta instead of
 *      overflowing it, and the same component in a wide card still shows both.
 */

import { expect, test } from "@censor/playwright/fixture"

const SLIDER_VIDEOS = ["lock_aaa", "lock_bbb"] as const
const SHORTS_VIDEO = "short_eee"
const WIDE_VIDEO = "lock_wide"

// ─────────────────────────────────────────────────────────────────────────────
// L1: the cards that were being missed
// ─────────────────────────────────────────────────────────────────────────────

test("L1: every video lockup in the slider masks", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  const snap = await fixture.pollDebug(
    page,
    (d) => SLIDER_VIDEOS.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of SLIDER_VIDEOS) {
    const entry = snap.entries[id]
    expect(entry, `entry for ${id} should exist`).toBeDefined()
    expect(entry?.viewKind, `${id} should be masked`).toBe("masked")

    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for ${id}`).toBe("0")
    expect(
      await fixture.fixtureCall<boolean>(page, "hasVeil", id),
      `veil for ${id}`
    ).toBe(true)
  }
})

test("L1: a wide lockup masks the same way as a narrow one", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  const snap = await fixture.pollDebug(page, (d) => WIDE_VIDEO in d.entries, {
    timeout: 5000,
  })
  expect(snap.entries[WIDE_VIDEO]?.viewKind).toBe("masked")
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

test("L2: a video lockup IS pre-masked before its veil arrives", async ({
  fixture,
}) => {
  // The other side of the same guard: the `:has()` in the occluder must not be
  // so narrow that it stops protecting real cards. Once the veil is up the
  // static filter is lifted by [data-boyo], so this asserts the rule matches
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

test("L3: a shorts lockup masks without a channel", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  const snap = await fixture.pollDebug(page, (d) => SHORTS_VIDEO in d.entries, {
    timeout: 5000,
  })

  expect(snap.entries[SHORTS_VIDEO]?.viewKind).toBe("masked")
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
  // a channel. Both used to be retried at 500ms forever, each pass re-scanning
  // the whole document. The attempt budget is ~10s, so by 15s the queue must
  // have drained.
  const snap = await fixture.pollDebug(page, (d) => d.unresolved === 0, {
    timeout: 15_000,
  })
  expect(snap.unresolved).toBe(0)
})

// ─────────────────────────────────────────────────────────────────────────────
// L4 / L5: the overflow
// ─────────────────────────────────────────────────────────────────────────────

test("L4: nothing the veil paints escapes a 168px card", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => "lock_aaa" in d.entries, {
    timeout: 5000,
  })

  // Masked, then meta, then title — the state that renders the most content,
  // and the one in the issue's screenshot.
  for (const clicks of [0, 1, 2]) {
    if (clicks > 0) {
      await fixture.fixtureCall<boolean>(page, "clickVeil", "lock_aaa", 1)
    }
    const overflow = await fixture.fixtureCall<number | null>(
      page,
      "veilOverflow",
      "lock_aaa"
    )
    expect(overflow, `overflow after ${clicks} click(s)`).not.toBeNull()
    const worst = overflow ?? 0
    expect(
      worst,
      `veil content overflows the card by ${worst}px after ${clicks} click(s)`
    ).toBeLessThanOrEqual(0.5)
  }
})

test("L5: a narrow card renders reduced meta; a wide one renders all of it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(
    page,
    (d) => "lock_aaa" in d.entries && WIDE_VIDEO in d.entries,
    { timeout: 5000 }
  )

  // One click each: masked → meta, the state that renders the meta chip.
  await fixture.fixtureCall<boolean>(page, "clickVeil", "lock_aaa", 1)
  await fixture.fixtureCall<boolean>(page, "clickVeil", WIDE_VIDEO, 1)

  type Meta = { channel: boolean; sub: boolean }

  const narrow = await fixture.fixtureCall<Meta | null>(
    page,
    "visibleMeta",
    "lock_aaa"
  )
  expect(narrow, "the narrow card should have a meta chip").not.toBeNull()
  expect(narrow?.channel, "the channel is the one row worth the space").toBe(
    true
  )
  expect(narrow?.sub, "duration · date is what was overflowing").toBe(false)

  const wide = await fixture.fixtureCall<Meta | null>(
    page,
    "visibleMeta",
    WIDE_VIDEO
  )
  expect(wide?.channel, "the wide card keeps the channel").toBe(true)
  expect(wide?.sub, "…and has room for the sub-line too").toBe(true)
})
