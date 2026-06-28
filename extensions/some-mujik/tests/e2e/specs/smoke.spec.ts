/**
 * some-mujik — smoke tests (non-headless, requires built extension).
 *
 * Minimal invariants for the display role (non-YouTube tab):
 *   T1 — extension loads without uncaught JS errors.
 *   T2 — no overlay root is present before a ytmo:song-data message arrives.
 *        The overlay mounts lazily on first message; passive load must be clean.
 *
 * These two checks are sufficient to know the content script initialised and
 * did not throw. All richer behavior (overlay mount, waveform, drag) depends
 * on receiving a ytmo:song-data message, which requires a live background
 * script and a YouTube source tab — out of scope for CI smoke.
 *
 * Run via:
 *   pnpm build:chromium && pnpm exec playwright test smoke
 *
 * Requires PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (set by nix develop .#playwright).
 */

import { expect, readMujikState, test } from "../fixture"

test.describe("some-mujik smoke", () => {
  test("T1: extension loads without uncaught JS errors", async ({
    fixture,
  }) => {
    const errors: Array<string> = []
    const page = await fixture.goto("nonyt-page")
    page.on("pageerror", (err) => errors.push(err.message))

    // Give content script a tick to run after page load.
    await page.waitForTimeout(500)

    expect(errors, "uncaught errors on load").toHaveLength(0)
  })

  test("T2: no overlay root present before any song-data message", async ({
    fixture,
  }) => {
    const page = await fixture.goto("nonyt-page")

    // Wait for content script to run (document_end fires after DOMContentLoaded).
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(300)

    const state = await readMujikState(page)
    expect(
      state.hasOverlayRoot,
      "overlay root must not exist before first song-data"
    ).toBe(false)
    expect(state.hasCard, "card must not exist before first song-data").toBe(
      false
    )
  })
})
