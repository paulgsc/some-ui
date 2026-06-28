/**
 * some-censor — smoke tests (non-headless, requires built extension).
 *
 * Minimal invariant: href-only video cards on a simulated YouTube home page
 * are masked within 5 seconds of the content script running. If this fails
 * the extension's core loop is broken and all other tests are moot.
 *
 * Run via:
 *   pnpm build:chromium && pnpm exec playwright test smoke
 *
 * Requires PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (set by nix develop .#playwright).
 */

import { expect, test } from "@censor/playwright/fixture"

test.describe("some-censor smoke", () => {
  test("href-only cards are masked on load", async ({ fixture }) => {
    const page = await fixture.goto("yt-home")

    const ids = ["vid_aaa111", "vid_bbb222", "vid_ccc333"]

    const snap = await fixture.pollDebug(
      page,
      (d) => d.phase === "running" && ids.every((id) => id in d.entries),
      { timeout: 5000 }
    )

    for (const id of ids) {
      expect(snap.entries[id]?.viewKind, `${id} should be masked`).toBe(
        "masked"
      )
    }
  })
})
