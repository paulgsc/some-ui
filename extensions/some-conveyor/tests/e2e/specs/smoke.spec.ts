/**
 * some-conveyor — smoke tests (non-headless, requires built extension).
 *
 * Minimal invariants: the content script runs, sets the duplicate-injection
 * guard on <html>, and appends the shadow host to document.body. If either
 * of these fails, the extension's scaffolding is broken before any WASM or
 * interaction behavior is reachable.
 *
 * Run via:
 *   pnpm build:chromium && pnpm exec playwright test smoke
 *
 * Requires PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (set by nix develop .#playwright).
 */

import { expect, test, waitForConveyorInit } from "@conveyor/playwright/fixture"

test.describe("some-conveyor smoke", () => {
  test("guard attribute is set on <html>", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    expect(snap.guardAttr).toBe("true")
  })

  test("shadow host is inserted with the correct id", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    expect(snap.hasHost).toBe(true)
  })
})
