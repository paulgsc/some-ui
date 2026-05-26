/**
 *
 * What we're testing (runtime invariants, not DOM structure):
 *
 *   T1 — k% masking: all fully-hydrated cards get data-boyo="0" (masked)
 *        within a reasonable convergence window after page load.
 *
 *   T2 — Late hydration: a card whose data-video-id is set after load
 *        (simulating YouTube's async attribute setting) eventually gets masked.
 *
 *   T3 — Navigation stale-state: after simulateNavigation(), all NEW cards
 *        are masked with fresh session, and OLD cards are pruned (not stale).
 *
 *   T4 — Element recycling: when a card's data-video-id is mutated in-place
 *        (scroll virtualizer), the new videoId gets masked, not the old one.
 *
 *   T5 — Click progression: clicking a masked card advances it to "meta",
 *        a second click advances to "title". __BOYO_DEBUG__.entries tracks this.
 *
 *   T6 — Session monotonicity: sessionOrdinal never decreases between snapshots.
 *
 * Non-goals:
 *   - Visual pixel-perfect assertions (CSS regression → separate Playwright visual tests)
 *   - Testing YouTube's own behavior
 *   - Testing against live network
 */

import { expect, test } from "./fixture"

// ── T1: k% masking on load ────────────────────────────────────────────────────

test("T1: all pre-hydrated cards are masked within 5s of page load", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Cards 1–3 have data-video-id set at parse time.
  // Card 4 does NOT — it simulates late hydration.
  const preHydratedIds = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

  const snap = await fixture.pollDebug(
    page,
    (d) =>
      d.phase === "running" && preHydratedIds.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  for (const id of preHydratedIds) {
    const entry = snap.entries[id]
    expect(entry, `entry for ${id} should exist`).toBeTruthy()
    expect(entry.viewKind, `${id} should be masked`).toBe("masked")
    expect(entry.isConnected, `${id} should be connected`).toBe(true)
  }

  // Also check data-boyo="0" directly on the element (belt-and-suspenders)
  for (const id of preHydratedIds) {
    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )
    expect(dataBoyo, `data-boyo for ${id}`).toBe("0")
  }
})

// ── T2: late hydration ────────────────────────────────────────────────────────

test("T2: late-hydrated card (data-video-id set after load) gets masked", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Wait for the pre-hydrated cards to settle first
  await fixture.pollDebug(page, (d) => d.phase === "running" && d.mounted >= 3)

  // Card 4 has NO data-video-id yet — confirm it's not in entries
  const before = await fixture.readDebug(page)
  expect(before?.entries["vid_ddd444"]).toBeUndefined()

  // Simulate YouTube hydrating the attribute
  await fixture.fixtureCall(page, "hydrateCard4")

  // Extension should pick it up via the attributeFilter mutation observer
  const snap = await fixture.pollDebug(page, (d) => "vid_ddd444" in d.entries, {
    timeout: 4000,
  })

  expect(snap.entries["vid_ddd444"].viewKind).toBe("masked")
})

// ── T3: navigation stale-state ────────────────────────────────────────────────

test("T3: after simulated SPA navigation, new cards are masked and old cards are pruned", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Wait for initial masking to converge
  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && d.mounted >= 3,
    { timeout: 5000 }
  )

  const sessionBefore = (await fixture.readDebug(page))!.sessionOrdinal

  // Simulate SPA navigation — replaces feed, fires yt-navigate-finish
  await fixture.fixtureCall(page, "simulateNavigation", "Gaming")

  const newIds = ["vid_nav001", "vid_nav002", "vid_nav003"]
  const oldIds = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

  // Wait for new cards to appear (deferred scan runs after 400ms)
  const snap = await fixture.pollDebug(
    page,
    (d) => newIds.every((id) => id in d.entries),
    { timeout: 6000 }
  )

  // New cards should be masked
  for (const id of newIds) {
    expect(snap.entries[id].viewKind, `new card ${id} should be masked`).toBe(
      "masked"
    )
  }

  // Old cards should be pruned (not connected → evicted by prune())
  for (const id of oldIds) {
    expect(
      snap.entries[id],
      `old card ${id} should be pruned from entries`
    ).toBeUndefined()
  }

  // Session should not have changed — navigation does NOT bump session
  // (only reset()+startSession() does). This is the M5 monotonicity invariant.
  expect(snap.sessionOrdinal).toBe(sessionBefore)
})

// ── T4: element recycling ─────────────────────────────────────────────────────

test("T4: recycled card (data-video-id mutated in place) gets fresh masked entry", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  // Advance card 1 to "meta" to give it non-initial state
  await page.evaluate(() => {
    const el = document.querySelector(
      'ytd-rich-item-renderer[data-video-id="vid_aaa111"]'
    )
    const veil = el?.querySelector(".boyo-veil") as HTMLElement | null
    veil?.click()
  })

  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_aaa111"]?.viewKind === "meta",
    { timeout: 3000 }
  )

  // Simulate scroll-virtualizer element reuse: same DOM element, new videoId
  await fixture.fixtureCall(
    page,
    "recycleCard",
    "vid_aaa111",
    "vid_recycled999"
  )

  // New id should appear as masked — NOT inheriting the old "meta" state
  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_recycled999" in d.entries,
    { timeout: 4000 }
  )

  expect(snap.entries["vid_recycled999"].viewKind).toBe("masked")
  // Old id should be gone
  expect(snap.entries["vid_aaa111"]).toBeUndefined()
})

// ── T5: click progression ─────────────────────────────────────────────────────

test("T5: click on masked card advances to meta; second click advances to title", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  // First click: masked → meta
  await page.evaluate(() => {
    const el = document.querySelector(
      'ytd-rich-item-renderer[data-video-id="vid_bbb222"]'
    )
    const veil = el?.querySelector(".boyo-veil") as HTMLElement | null
    veil?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })

  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "meta",
    { timeout: 3000 }
  )

  // Second click: meta → title
  await page.evaluate(() => {
    const el = document.querySelector(
      'ytd-rich-item-renderer[data-video-id="vid_bbb222"]'
    )
    const veil = el?.querySelector(".boyo-veil") as HTMLElement | null
    veil?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })

  const snap = await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "title",
    { timeout: 3000 }
  )

  expect(snap.entries["vid_bbb222"].viewKind).toBe("title")

  // data-boyo should be "2"
  const dataBoyo = await fixture.fixtureCall<string | null>(
    page,
    "dataBoyoFor",
    "vid_bbb222"
  )
  expect(dataBoyo).toBe("2")
})

// ── T6: session monotonicity ──────────────────────────────────────────────────

test("T6: sessionOrdinal never decreases across any observed state changes", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  const snapshots: number[] = []

  // Collect snapshots during initial load
  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return d.mounted >= 3
    },
    { timeout: 5000 }
  )

  // Simulate navigation (does NOT reset session)
  await fixture.fixtureCall(page, "simulateNavigation", "Tech")
  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return "vid_nav001" in d.entries
    },
    { timeout: 6000 }
  )

  // Verify monotonicity
  for (let i = 1; i < snapshots.length; i++) {
    expect(
      snapshots[i],
      `sessionOrdinal should not decrease at index ${i}`
    ).toBeGreaterThanOrEqual(snapshots[i - 1]!)
  }
})
