/**
 * BOYO — runtime invariant tests
 *
 * Purpose
 * -------
 * These tests validate the extension's runtime convergence semantics and
 * state-machine correctness.
 *
 * Important
 * ---------
 * Run diagnostics.spec.ts first when debugging environment/setup issues.
 *
 * This suite assumes:
 *   - Firefox extension loaded correctly
 *   - content scripts injected
 *   - debug bridge operational
 *   - fixture HTML valid
 *
 * What we're testing
 * ------------------
 *   T1 — Pre-hydrated cards converge to masked state.
 *   T2 — Late hydration eventually converges to masked state.
 *   T3 — SPA navigation prunes stale entries and masks new entries.
 *   T4 — Recycled DOM elements get fresh runtime state.
 *   T5 — Click progression advances masking state machine correctly.
 *   T6 — sessionOrdinal never decreases.
 *
 * Design philosophy
 * -----------------
 * Tests assert runtime invariants, not DOM structure.
 *
 * We care about:
 *   - convergence
 *   - state transitions
 *   - observer correctness
 *   - stale-state pruning
 *
 * We do NOT care about:
 *   - pixel output
 *   - YouTube internals
 *   - exact DOM layout
 */

import { expect, test } from "@censor/playwright/fixture"

// ─────────────────────────────────────────────────────────────────────────────
// T1: pre-hydrated masking convergence
// ─────────────────────────────────────────────────────────────────────────────

test("T1: all pre-hydrated cards are masked within 5s of page load", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  /**
   * Cards already hydrated at parse-time.
   */
  const preHydratedIds = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

  /**
   * Wait until runtime converges and every expected entry exists.
   */
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

  /**
   * Belt-and-suspenders assertion:
   * validate actual DOM attribute state too.
   */
  for (const id of preHydratedIds) {
    const dataBoyo = await fixture.fixtureCall<string | null>(
      page,
      "dataBoyoFor",
      id
    )

    expect(dataBoyo, `data-boyo for ${id}`).toBe("0")
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T2: late hydration
// ─────────────────────────────────────────────────────────────────────────────

test("T2: late-hydrated card gets masked after attribute mutation", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  /**
   * Wait for initial convergence before mutating.
   */
  await fixture.pollDebug(page, (d) => d.phase === "running" && d.mounted >= 3)

  /**
   * Confirm unresolved card is not tracked yet.
   */
  const before = await fixture.readDebug(page)

  expect(before?.entries["vid_ddd444"]).toBeUndefined()

  /**
   * Simulate YouTube asynchronously setting data-video-id.
   */
  await fixture.fixtureCall(page, "hydrateCard4")

  /**
   * Observer should detect attribute mutation and process the card.
   */
  const snap = await fixture.pollDebug(page, (d) => "vid_ddd444" in d.entries, {
    timeout: 4000,
  })

  expect(snap.entries["vid_ddd444"].viewKind).toBe("masked")
})

// ─────────────────────────────────────────────────────────────────────────────
// T3: SPA navigation stale-state pruning
// ─────────────────────────────────────────────────────────────────────────────

test("T3: SPA navigation masks new cards and prunes stale entries", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && d.mounted >= 3,
    { timeout: 5000 }
  )

  const sessionBefore = (await fixture.readDebug(page))!.sessionOrdinal

  /**
   * Simulate YouTube SPA feed replacement.
   */
  await fixture.fixtureCall(page, "simulateNavigation", "Gaming")

  const newIds = ["vid_nav001", "vid_nav002", "vid_nav003"]
  const oldIds = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

  const snap = await fixture.pollDebug(
    page,
    (d) => newIds.every((id) => id in d.entries),
    { timeout: 6000 }
  )

  /**
   * New feed cards should converge to masked state.
   */
  for (const id of newIds) {
    expect(snap.entries[id].viewKind, `new card ${id} should be masked`).toBe(
      "masked"
    )
  }

  /**
   * Old disconnected cards should be pruned.
   */
  for (const id of oldIds) {
    expect(snap.entries[id], `old card ${id} should be pruned`).toBeUndefined()
  }

  /**
   * SPA navigation must not decrease or reset sessionOrdinal.
   */
  expect(snap.sessionOrdinal).toBe(sessionBefore)
})

// ─────────────────────────────────────────────────────────────────────────────
// T4: recycled DOM element handling
// ─────────────────────────────────────────────────────────────────────────────

test("T4: recycled element receives fresh masked state", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  /**
   * Advance original card state before recycling.
   */
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

  /**
   * Reuse same DOM node with new video id.
   */
  await fixture.fixtureCall(
    page,
    "recycleCard",
    "vid_aaa111",
    "vid_recycled999"
  )

  /**
   * New identity must receive fresh masked state,
   * not inherit previous runtime state.
   */
  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_recycled999" in d.entries,
    { timeout: 4000 }
  )

  expect(snap.entries["vid_recycled999"].viewKind).toBe("masked")
  expect(snap.entries["vid_aaa111"]).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T5: click progression state machine
// ─────────────────────────────────────────────────────────────────────────────

test("T5: clicking advances masked → meta → title", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  /**
   * First click:
   * masked -> meta
   */
  await page.evaluate(() => {
    const el = document.querySelector(
      'ytd-rich-item-renderer[data-video-id="vid_bbb222"]'
    )

    const veil = el?.querySelector(".boyo-veil") as HTMLElement | null

    veil?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      })
    )
  })

  await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "meta",
    { timeout: 3000 }
  )

  /**
   * Second click:
   * meta -> title
   */
  await page.evaluate(() => {
    const el = document.querySelector(
      'ytd-rich-item-renderer[data-video-id="vid_bbb222"]'
    )

    const veil = el?.querySelector(".boyo-veil") as HTMLElement | null

    veil?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      })
    )
  })

  const snap = await fixture.pollDebug(
    page,
    (d) => d.entries["vid_bbb222"]?.viewKind === "title",
    { timeout: 3000 }
  )

  expect(snap.entries["vid_bbb222"].viewKind).toBe("title")

  /**
   * DOM encoding:
   *   0 -> masked
   *   1 -> meta
   *   2 -> title
   */
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

  /**
   * Capture ordinals during initial convergence.
   */
  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return d.mounted >= 3
    },
    { timeout: 5000 }
  )

  /**
   * Simulate SPA navigation.
   */
  await fixture.fixtureCall(page, "simulateNavigation", "Tech")

  await fixture.pollDebug(
    page,
    (d) => {
      snapshots.push(d.sessionOrdinal)
      return "vid_nav001" in d.entries
    },
    { timeout: 6000 }
  )

  /**
   * sessionOrdinal is allowed to stay constant or increase,
   * but never decrease.
   */
  for (let i = 1; i < snapshots.length; i++) {
    expect(
      snapshots[i],
      `sessionOrdinal decreased at index ${i}`
    ).toBeGreaterThanOrEqual(snapshots[i - 1])
  }
})
