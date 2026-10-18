/**
 * BOYO — runtime invariant tests (rewritten)
 *
 * These assert behavioral invariants that the PRODUCTION bugs violated. The
 * previous suite passed against all six reported bugs because its fixture
 * hardcoded data-video-id and wiped the DOM on navigation. This suite uses
 * href-only cards and in-place element reuse so the tests can actually fail
 * when the extension is broken.
 *
 * T1 — href-only cards resolve and are plated (no data-video-id fast path).
 * T2 — a card with a late-hydrating channel is plated immediately on
 *      videoId, then backfills its channel.
 * T3 — chip/SPA navigation that REUSES elements clears stale view state.
 * T4 — recycled elements (data-video-id mutation) are decided afresh.
 * T5 — no gesture changes a card (#1803).
 * T6 — sessionOrdinal never decreases.
 * T7 — watch-page sidebar (compact renderers) is decided like the feed.
 * T8 — navigation BUMPS the session (the fix for stale state).
 * T9 — an absent card is out of layout, out of the accessibility tree and
 *      out of the Tab order.
 * T10 — a renderer repointed at a new video is decided afresh (QD1).
 * T11 — an href-only lockup's card survives preview-anchor churn.
 * T12 covered a plated card with its veil; the plate replaced the veil
 *      (#1804), and plate.spec.ts covers it.
 */

import { expect, test } from "@censor/playwright/fixture"

// ─────────────────────────────────────────────────────────────────────────────
// T1: href-only resolution
// ─────────────────────────────────────────────────────────────────────────────

test("T1: href-only cards (no data-video-id) are all plated within 5s", async ({
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
    expect(entry.viewKind, `${id} should be plated`).toBe("plated")
    expect(entry.isConnected, `${id} should be connected`).toBe(true)
  }

  for (const id of ids) {
    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for ${id}`).toBe("plated")
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T2: video-only mount + channel backfill
// ─────────────────────────────────────────────────────────────────────────────

test("T2: card with no channel anchor is plated immediately, then backfills channel", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Card 4 has a watch href but NO channel anchor at load. It must still mask.
  const adopted = await fixture.pollDebug(
    page,
    (d) => "vid_ddd444" in d.entries,
    { timeout: 5000 }
  )
  const entry = adopted.entries["vid_ddd444"]
  expect(entry, "video-only card should mount").toBeDefined()
  if (entry === undefined) throw new Error("missing vid_ddd444")
  expect(entry.viewKind, "should be plated on videoId alone").toBe("plated")

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
  // Still plated — a channel arriving does not move the view.
  expect(backfilled.entries["vid_ddd444"]?.viewKind).toBe("plated")
})

// ─────────────────────────────────────────────────────────────────────────────
// T3: navigation clears stale view state (the core bug)
// ─────────────────────────────────────────────────────────────────────────────

test("T3: element-reuse navigation forgets the old cards and decides the new ones", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  // Navigate via element-REUSE (old elements stay connected).
  await fixture.fixtureCall(page, "simulateNavigation", "Gaming")

  const newIds = ["vid_nav001", "vid_nav002", "vid_nav003"]
  const snap = await fixture.pollDebug(
    page,
    (d) => newIds.every((id) => id in d.entries),
    { timeout: 6000 }
  )

  for (const id of newIds) {
    expect(snap.entries[id]?.viewKind, `${id} should be plated`).toBe("plated")
  }
  // The old card is GONE: its element was reused under a new identity, and the
  // session bump destroyed the old entry.
  expect(
    snap.entries["vid_aaa111"],
    "stale card should not survive navigation"
  ).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T4: recycled element handling
// ─────────────────────────────────────────────────────────────────────────────

test("T4: a recycled element is decided afresh", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

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
  expect(snap.entries["vid_recycled999"]?.viewKind).toBe("plated")
  expect(snap.entries["vid_aaa111"]).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T5: gestures are not inputs
// ─────────────────────────────────────────────────────────────────────────────

test("T5: a click, a double click or a context menu changes nothing", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  for (const type of ["click", "dblclick", "contextmenu"]) {
    await page.evaluate((eventType) => {
      const el = document.querySelector('[data-boyo-vid="vid_bbb222"]')
      if (!(el instanceof HTMLElement)) throw new Error("card not found")
      el.dispatchEvent(
        new MouseEvent(eventType, { bubbles: true, cancelable: true })
      )
    }, type)
  }
  await page.waitForTimeout(600)

  const snap = await fixture.readDebug(page)
  expect(snap?.entries["vid_bbb222"]?.viewKind).toBe("plated")
  expect(
    await fixture.fixtureCall<string | null>(page, "dataBoyoFor", "vid_bbb222")
  ).toBe("plated")
  expect(
    await fixture.fixtureCall<boolean>(page, "hasPlate", "vid_bbb222")
  ).toBe(true)
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

test("T7: watch-page sidebar compact renderers are decided like the feed", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch")

  const dated = ["vid_side001", "vid_side002"]
  const undated = "vid_side003"

  const snap = await fixture.pollDebug(
    page,
    (d) =>
      d.phase === "running" &&
      [...dated, undated].every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of dated) {
    expect(snap.entries[id]?.viewKind, `sidebar ${id} is old`).toBe("plated")
    expect(
      await fixture.fixtureCall<string | null>(page, "dataBoyoFor", id),
      `data-boyo for sidebar ${id}`
    ).toBe("plated")
    expect(
      await fixture.fixtureCall<boolean>(page, "hasPlate", id),
      `plate for sidebar ${id}`
    ).toBe(true)
  }
  expect(
    snap.entries[undated]?.viewKind,
    "a sidebar card with no date is held"
  ).toBe("absent")
})

test("T7b: rail and panel cards resolve a channel from its name; a Mix waits for none (#1848)", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch")
  const ids = ["vid_rail001", "vid_mix0002", "vid_panel01"]

  const snap = await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && ids.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  expect(snap.entries["vid_rail001"]?.viewKind, "the rail card is old").toBe(
    "plated"
  )
  expect(snap.entries["vid_rail001"]?.channelId).toBe("Rail Channel")
  expect(snap.entries["vid_panel01"]?.channelId).toBe("Panel Channel")
  expect(
    snap.entries["vid_mix0002"]?.channelId,
    "an artist list is not a channel"
  ).toBe("")
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
// T9: absent is gone, plated is covered (#1803)
// ─────────────────────────────────────────────────────────────────────────────

test("T9: an absent card is out of layout, the accessibility tree and the Tab order", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  // A card too young to show, inserted like an infinite-scroll batch.
  await page.evaluate(() => {
    const el = document.createElement("ytd-rich-item-renderer")
    el.id = "fresh-card"
    el.innerHTML = `
      <div class="thumbnail"></div>
      <a id="video-title" href="/watch?v=vid_fresh01">A Fresh Video</a>
      <ytd-channel-name><yt-formatted-string>Now</yt-formatted-string></ytd-channel-name>
      <a href="/@Now">Now</a>
      <div id="metadata-line"><span>9 views</span><span>3 days ago</span></div>`
    document.getElementById("primary")?.appendChild(el)
  })
  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_fresh01" in d.entries,
    { timeout: 5000 }
  )
  expect(snap.entries["vid_fresh01"]?.viewKind).toBe("absent")

  const fresh = page.locator("#fresh-card")
  expect(await fresh.getAttribute("data-boyo")).toBe("absent")
  expect(await fresh.boundingBox(), "not laid out").toBeNull()
  await expect(
    page.getByRole("link", { name: "A Fresh Video" }),
    "not in the accessibility tree"
  ).toHaveCount(0)

  // Walk the whole Tab order: none of its links is ever focused.
  const reached = new Set<string>()
  await page.locator("body").focus()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab")
    const href = await page.evaluate(
      () => document.activeElement?.getAttribute("href") ?? ""
    )
    reached.add(href)
  }
  expect([...reached].some((h) => h.includes("vid_fresh01"))).toBe(false)
  expect(
    [...reached].some((h) => h.includes("vid_aaa111")),
    "precondition: the walk does reach a plated card's link"
  ).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// T10: the reported symptom — reveal, then vendor churn, in a real browser
// ─────────────────────────────────────────────────────────────────────────────

type Occlusion = {
  blurred: boolean
  pointerEvents: string
  dataBoyo: string | null
}

test("T10: a renderer repointed at a new video is decided afresh, and is never inert", async ({
  fixture,
}) => {
  // Driven through the Sensor's attribute signal — a `data-video-id`
  // mutation on an element matching SEL — so this exercises the real
  // production path rather than whatever the retry loop happens to be doing.
  //
  // 1. The QD1 half: a renderer whose authoritative data-video-id has moved on
  //    is a different artifact, however much of the old one is still lying
  //    around in its subtree, and is decided on its own evidence.
  // 2. The swap must not route through the bare static occluder, which
  //    takes no pointer events (blurred *and* unclickable).
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

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

  expect(snap.entries["vid_repointed"]?.viewKind).toBe("plated")
  expect(
    snap.entries["vid_bbb222"],
    "and the old entry is gone, not left on a card showing something else"
  ).toBeUndefined()

  const after = await fixture.fixtureCall<Occlusion | null>(
    page,
    "isOccludedByIdFor",
    "vid_repointed"
  )
  expect(after?.dataBoyo, "custody is held throughout the swap").toBe("plated")
  expect(after?.blurred, "not handed back to the static occluder").toBe(false)
  expect(
    after?.pointerEvents,
    "and still takes pointer events — the inert state being ruled out"
  ).not.toBe("none")
})

test("T11: an href-only lockup's card survives preview-anchor churn", async ({
  fixture,
}) => {
  // A Lit lockup has no authoritative `data-video-id`, so anchor membership is the
  // only evidence there is. A preview anchor landing ahead of the card's own
  // changes what extraction answers, and treating that as a recycle would drop
  // the card under the occluder's `pointer-events: none`. T10 cannot cover
  // this: it writes a contradictory authoritative id, which is decisive, so it
  // always takes the recycle path.
  //
  // Two Sensor paths re-observe the mounted lockup here: the mutation handler
  // (a childList mutation inside a card re-observes that card) and the retry
  // loop's scan(). The loop only runs while a queue is non-empty, so this test
  // **asserts** that precondition rather than assuming it: the fixture's
  // channel lockup cannot resolve and holds `unresolved` above zero for its
  // ~10s budget. Without this assertion the test could go quietly vacuous if
  // the fixture changed.
  const page = await fixture.goto("yt-home")

  const before = await fixture.pollDebug(
    page,
    (d) => d.entries["lock_aaa"]?.viewKind === "plated",
    { timeout: 5000 }
  )

  expect(
    before.unresolved,
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
  expect(after?.dataBoyo, "custody is kept through the churn").toBe("plated")
  expect(after?.blurred, "not handed back to the static occluder").toBe(false)
  expect(
    after?.pointerEvents,
    "and still takes pointer events — the inert state being ruled out"
  ).not.toBe("none")

  const snap = await fixture.readDebug(page)
  expect(snap?.entries["lock_aaa"]?.viewKind).toBe("plated")
  expect(
    snap?.entries["preview_zzz"],
    "the preview is not a card"
  ).toBeUndefined()
})
