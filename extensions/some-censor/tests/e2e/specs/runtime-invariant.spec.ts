/**
 * BOYO — runtime invariant tests (rewritten)
 *
 * These assert behavioral invariants that the PRODUCTION bugs violated. The
 * previous suite passed against all six reported bugs because its fixture
 * hardcoded data-video-id and wiped the DOM on navigation. This suite uses
 * href-only cards and in-place element reuse so the tests can actually fail
 * when the extension is broken.
 *
 * T1 — href-only cards resolve and mask (no data-video-id fast path).
 * T2 — a card with a late-hydrating channel masks immediately on videoId,
 *      then backfills its channel.
 * T3 — chip/SPA navigation that REUSES elements clears stale view state.
 * T4 — recycled elements (data-video-id mutation) get fresh masked state.
 * T5 — click progression masked → meta → title.
 * T6 — sessionOrdinal never decreases.
 * T7 — watch-page sidebar (compact renderers) is masked.
 * T8 — navigation BUMPS the session (the fix for stale state).
 * T9 — dblclick reveals from any state, and the veil stops taking clicks.
 * T10 — a revealed renderer repointed at a new video re-masks (QD1, #1423).
 * T11 — a revealed href-only lockup survives preview-anchor churn (#1423).
 */

import { expect, test } from "@censor/playwright/fixture"

// ─────────────────────────────────────────────────────────────────────────────
// T1: href-only resolution + masking
// ─────────────────────────────────────────────────────────────────────────────

test("T1: href-only cards (no data-video-id) all mask within 5s", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  const ids = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

  const snap = await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && ids.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of ids) {
    const entry = snap.entries[id]
    expect(entry, `entry for ${id} should exist`).toBeDefined()
    if (entry === undefined) throw new Error(`missing entry: ${id}`)
    expect(entry.viewKind, `${id} should be masked`).toBe("masked")
    expect(entry.isConnected, `${id} should be connected`).toBe(true)
  }

  for (const id of ids) {
    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for ${id}`).toBe("0")
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T2: video-only mount + channel backfill
// ─────────────────────────────────────────────────────────────────────────────

test("T2: card with no channel anchor masks immediately, then backfills channel", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Card 4 has a watch href but NO channel anchor at load. It must still mask.
  const masked = await fixture.pollDebug(
    page,
    (d) => "vid_ddd444" in d.entries,
    { timeout: 5000 }
  )
  const entry = masked.entries["vid_ddd444"]
  expect(entry, "video-only card should mount").toBeDefined()
  if (entry === undefined) throw new Error("missing vid_ddd444")
  expect(entry.viewKind, "should be masked on videoId alone").toBe("masked")

  // Channel id is provisionally empty until backfill.
  expect(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    entry.channelId === "" || entry.channelId === undefined,
    "channel should be provisional before hydration"
  ).toBe(true)

  // Hydrate the channel anchor; retry loop should backfill it.
  await fixture.fixtureCall(page, "hydrateChannel4")

  const backfilled = await fixture.pollDebug(
    page,
    (d) => {
      const e = d.entries["vid_ddd444"]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return e !== undefined && e.channelId !== "" && e.channelId !== undefined
    },
    { timeout: 5000 }
  )
  expect(backfilled.entries["vid_ddd444"]?.channelId).toBeTruthy()
  // Still masked — backfill must not advance the view.
  expect(backfilled.entries["vid_ddd444"]?.viewKind).toBe("masked")
})

// ─────────────────────────────────────────────────────────────────────────────
// T3: navigation clears stale view state (the core bug)
// ─────────────────────────────────────────────────────────────────────────────

test("T3: progressed card is reset to masked after element-reuse navigation", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  // Advance a card to title (two clicks) so it has non-masked stale state.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("ytd-rich-item-renderer")].find(
        (n) => n.getAttribute("data-boyo-vid") === "vid_aaa111"
      )
      const veil = el?.querySelector(".boyo-veil")
      if (!(veil instanceof HTMLElement)) throw new Error("veil not found")
      veil.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    await page.waitForTimeout(400) // clear the dblclick gate window
  }

  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_aaa111"]?.viewKind === "title",
    { timeout: 3000 }
  )

  // Navigate via element-REUSE (old elements stay connected).
  await fixture.fixtureCall(page, "simulateNavigation", "Gaming")

  const newIds = ["vid_nav001", "vid_nav002", "vid_nav003"]
  const snap = await fixture.pollDebug(
    page,
    (d) => newIds.every((id) => id in d.entries),
    { timeout: 6000 }
  )

  // New feed cards masked...
  for (const id of newIds) {
    expect(snap.entries[id]?.viewKind, `${id} should be masked`).toBe("masked")
  }
  // ...and the stale title-state card is GONE (its element was reused under a
  // new identity, and the session bump destroyed the old entry).
  expect(
    snap.entries["vid_aaa111"],
    "stale card should not survive navigation"
  ).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T4: recycled element handling
// ─────────────────────────────────────────────────────────────────────────────

test("T4: recycled element receives fresh masked state", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  await page.evaluate(() => {
    const el = [...document.querySelectorAll("ytd-rich-item-renderer")].find(
      (n) => n.getAttribute("data-boyo-vid") === "vid_aaa111"
    )
    const veil = el?.querySelector(".boyo-veil")
    if (!(veil instanceof HTMLElement)) throw new Error("veil not found")
    veil.click()
  })

  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_aaa111"]?.viewKind === "meta",
    { timeout: 3000 }
  )

  await fixture.fixtureCall(
    page,
    "recycleCard",
    "vid_aaa111",
    "vid_recycled999"
  )

  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_recycled999" in d.entries,
    { timeout: 4000 }
  )
  expect(snap.entries["vid_recycled999"]?.viewKind).toBe("masked")
  expect(snap.entries["vid_aaa111"]).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T5: click progression
// ─────────────────────────────────────────────────────────────────────────────

test("T5: clicking advances masked → meta → title", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  const clickCard = (): Promise<void> =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll("ytd-rich-item-renderer")].find(
        (n) => n.getAttribute("data-boyo-vid") === "vid_bbb222"
      )
      const veil = el?.querySelector(".boyo-veil")
      if (!(veil instanceof HTMLElement)) throw new Error("veil not found")
      veil.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

  await clickCard()
  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "meta",
    { timeout: 3000 }
  )
  // Meta chip should actually be in the DOM.
  const metaBoyo = await fixture.fixtureCall<string | null>(
    page,
    "dataBoyoFor",
    "vid_bbb222"
  )
  expect(metaBoyo).toBe("1")

  await page.waitForTimeout(400) // clear dblclick gate
  await clickCard()
  const snap = await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "title",
    { timeout: 3000 }
  )
  expect(snap.entries["vid_bbb222"]?.viewKind).toBe("title")

  const dataBoyo = await fixture.fixtureCall<string | null>(
    page,
    "dataBoyoFor",
    "vid_bbb222"
  )
  expect(dataBoyo).toBe("2")
})

// ─────────────────────────────────────────────────────────────────────────────
// T6: session monotonicity
// ─────────────────────────────────────────────────────────────────────────────

test("T6: sessionOrdinal never decreases", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")
  const snapshots: Array<number> = []

  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return d.mounted >= 3
    },
    { timeout: 5000 }
  )

  await fixture.fixtureCall(page, "simulateNavigation", "Tech")

  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return "vid_nav001" in d.entries
    },
    { timeout: 6000 }
  )

  for (let i = 1; i < snapshots.length; i++) {
    const current = snapshots[i]
    const previous = snapshots[i - 1]
    if (current === undefined || previous === undefined) {
      throw new Error(`missing snapshot at index ${i}`)
    }
    expect(
      current,
      `sessionOrdinal decreased at index ${i}`
    ).toBeGreaterThanOrEqual(previous)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T7: watch-page sidebar masking (issue #4)
// ─────────────────────────────────────────────────────────────────────────────

test("T7: watch-page sidebar compact renderers are masked", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch")

  const sidebarIds = ["vid_side001", "vid_side002", "vid_side003"]

  const snap = await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && sidebarIds.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of sidebarIds) {
    expect(snap.entries[id]?.viewKind, `sidebar ${id} should mask`).toBe(
      "masked"
    )
  }

  for (const id of sidebarIds) {
    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for sidebar ${id}`).toBe("0")
    const hasVeil = await fixture.fixtureCall<boolean>(page, "hasVeil", id)
    expect(hasVeil, `veil for sidebar ${id}`).toBe(true)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T8: navigation bumps the session (root-cause guard for stale state)
// ─────────────────────────────────────────────────────────────────────────────

test("T8: yt-navigate-finish increments sessionOrdinal", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  const before = await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && d.mounted >= 3,
    { timeout: 5000 }
  )
  const sessionBefore = before.sessionOrdinal

  await fixture.fixtureCall(page, "simulateNavigation", "Music")

  const after = await fixture.pollDebug(
    page,
    (d) => "vid_nav001" in d.entries && d.sessionOrdinal > sessionBefore,
    { timeout: 6000 }
  )

  expect(
    after.sessionOrdinal,
    "navigation must mint a new session to clear stale state"
  ).toBeGreaterThan(sessionBefore)
})

// ─────────────────────────────────────────────────────────────────────────────
// T9: dblclick reveal — untested by T5, which only exercises single clicks
// ─────────────────────────────────────────────────────────────────────────────

test("T9: dblclick reveals a masked card directly, and the veil is gone", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(page, "dblclickVeil", "vid_bbb222")

  const snap = await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "revealed",
    { timeout: 3000 }
  )
  expect(snap.entries["vid_bbb222"]?.viewKind).toBe("revealed")

  // removeVeil animates the veil out (see DomHandle._animateRemoveVeil); give
  // it room to finish rather than the 600ms fallback timeout it races.
  await page.waitForTimeout(700)

  expect(
    await fixture.fixtureCall<boolean>(page, "hasVeil", "vid_bbb222"),
    "the veil must actually leave the DOM, not just the FSM"
  ).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// T10: the reported symptom — reveal, then vendor churn, in a real browser
// ─────────────────────────────────────────────────────────────────────────────

type Occlusion = {
  blurred: boolean
  pointerEvents: string
  dataBoyo: string | null
}

test("T10: a revealed renderer repointed at a new video re-masks, and is never inert", async ({
  fixture,
}) => {
  // Two things at once, both driven through observer.ts's signal (1) — an
  // attribute mutation on an element matching SEL — so this exercises the real
  // production path rather than whatever the retry loop happens to be doing.
  //
  // 1. The QD1 half: a renderer whose authoritative data-video-id has moved on
  //    is a different artifact, however much of the old one is still lying
  //    around in its subtree. It must NOT inherit the old card's `revealed`.
  // 2. The #1423 half: re-masking must not route through the bare static
  //    occluder, which takes no pointer events — blurred *and* unclickable was
  //    the reported symptom.
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(page, "dblclickVeil", "vid_bbb222")
  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "revealed",
    { timeout: 3000 }
  )

  // The card's own /watch?v=vid_bbb222 anchor stays exactly where it was.
  await fixture.fixtureCall<boolean>(
    page,
    "repointRenderer",
    "vid_bbb222",
    "vid_repointed"
  )

  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_repointed" in d.entries,
    { timeout: 5000 }
  )

  expect(
    snap.entries["vid_repointed"]?.viewKind,
    "the new artifact is masked — it never inherits the old card's disclosure"
  ).toBe("masked")
  expect(
    snap.entries["vid_bbb222"],
    "and the old entry is gone, not left revealed on a card showing something else"
  ).toBeUndefined()

  const after = await fixture.fixtureCall<Occlusion | null>(
    page,
    "isOccludedByIdFor",
    "vid_repointed"
  )
  expect(after?.dataBoyo, "custody is held throughout the swap").toBe("0")
  expect(after?.blurred, "not handed back to the static occluder").toBe(false)
  expect(
    after?.pointerEvents,
    "and still takes clicks — the inert state being ruled out"
  ).not.toBe("none")
})

test("T11: a revealed href-only lockup survives preview-anchor churn", async ({
  fixture,
}) => {
  // The other half of #1423, and the one the user actually reported: a Lit
  // lockup has no authoritative `data-video-id`, so anchor membership is the
  // only evidence there is. A preview anchor landing ahead of the card's own
  // changes what extraction answers, and re-masking on that would revoke the
  // user's disclosure and drop the card under the occluder's
  // `pointer-events: none`. T10 cannot cover this: it writes a contradictory
  // authoritative id, which is decisive, so it always takes the recycle path.
  //
  // The reconciliation that re-upserts a mounted lockup here is the retry
  // loop's scan() — observer.ts has no signal for "a descendant anchor
  // changed" (see the round-1 review). That is a real production path, but it
  // only runs while a queue is non-empty, so this test **asserts** that
  // precondition rather than assuming it: the fixture's channel lockup cannot
  // resolve and holds `unresolved` above zero for its ~10s budget. Without
  // this assertion the test could go quietly vacuous if the fixture changed.
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "lock_aaa" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(page, "dblclickVeil", "lock_aaa")
  const revealed = await fixture.pollDebug(
    page,
    (d) => d.entries["lock_aaa"]?.viewKind === "revealed",
    { timeout: 3000 }
  )

  expect(
    revealed.unresolved,
    "precondition: a queue is non-empty, so the retry loop's scan() is live and will reconcile"
  ).toBeGreaterThan(0)

  await fixture.fixtureCall<boolean>(
    page,
    "injectPreviewAnchor",
    "lock_aaa",
    "preview_zzz"
  )

  // Several retry passes (the loop ticks at 500ms), well inside the budget
  // asserted above.
  await page.waitForTimeout(2000)

  const after = await fixture.fixtureCall<Occlusion | null>(
    page,
    "isOccludedByIdFor",
    "lock_aaa"
  )
  expect(after?.dataBoyo, "custody is kept through the churn").toBe("3")
  expect(after?.blurred, "not handed back to the static occluder").toBe(false)
  expect(
    after?.pointerEvents,
    "and still takes clicks — the inert state being ruled out"
  ).not.toBe("none")

  const snap = await fixture.readDebug(page)
  expect(
    snap?.entries["lock_aaa"]?.viewKind,
    "the user's own disclosure is not silently revoked"
  ).toBe("revealed")
})

test("T9: dblclick reveals a card already progressed to title, not just a fresh masked one", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  // masked -> meta -> title, the same two single clicks T5 exercises.
  await fixture.fixtureCall<boolean>(page, "clickVeil", "vid_bbb222", 2)
  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "title",
    { timeout: 3000 }
  )

  await fixture.fixtureCall<boolean>(page, "dblclickVeil", "vid_bbb222")

  const snap = await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "revealed",
    { timeout: 3000 }
  )
  expect(snap.entries["vid_bbb222"]?.viewKind).toBe("revealed")
})
