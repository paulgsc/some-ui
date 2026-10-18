/**
 * BOYO — search results (#1864)
 *
 * SR1 — Search's compact ages are read: an old result is plated, and a
 *       recent one is held absent.
 */

import { expect, test } from "@censor/playwright/fixture"

test("SR1: search ages decide its results", async ({ fixture }) => {
  const page = await fixture.goto("yt-search")
  const snap = await fixture.pollDebug(
    page,
    (d) => "vid_srch_old" in d.entries && "vid_srch_new" in d.entries
  )
  expect(snap.entries["vid_srch_old"]?.viewKind).toBe("plated")
  expect(snap.entries["vid_srch_new"]?.viewKind).toBe("absent")
})
