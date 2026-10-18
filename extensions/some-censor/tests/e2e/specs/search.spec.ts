/**
 * BOYO — search results (#1864)
 *
 * SR1 — An old result is plated, a streamed one by its stream date, and a
 *       recent one is held absent: search's compact ages are read.
 * SR2 — A live result, whose only run is "N watching", is held absent.
 *       That the count reads as live rather than as an age is
 *       `maturity.test.ts`'s.
 */

import { expect, test } from "@censor/playwright/fixture"

const IDS = ["vid_srch_old", "vid_srch_strm", "vid_srch_new", "vid_srch_live"]

test("SR1: search ages decide its results", async ({ fixture }) => {
  const page = await fixture.goto("yt-search")
  const snap = await fixture.pollDebug(page, (d) =>
    IDS.every((id) => id in d.entries)
  )
  expect(snap.entries["vid_srch_old"]?.viewKind).toBe("plated")
  expect(snap.entries["vid_srch_strm"]?.viewKind).toBe("plated")
  expect(snap.entries["vid_srch_new"]?.viewKind).toBe("absent")
})

test("SR2: a live result is held absent", async ({ fixture }) => {
  const page = await fixture.goto("yt-search")
  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_srch_live" in d.entries
  )
  expect(snap.entries["vid_srch_live"]?.viewKind).toBe("absent")
})
