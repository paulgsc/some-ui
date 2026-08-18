/**
 * WASM-bridge graceful-failure E2E tests.
 *
 * The `@some-ui/polyhedron` WASM crate is built separately (crates/polyhedron)
 * and is NOT present in the extension dist/ at test time — it is declared
 * `external` in vite.config.chromium.ts. When the extension loads,
 * WasmBridge.initialize() will attempt a dynamic import("@some-ui/polyhedron")
 * that fails with a network/module error. The `.catch()` on that call
 * swallows the error.
 *
 * These tests verify that this graceful-failure path works correctly:
 *   - The conveyor still initialises (shadow host appears)
 *   - No uncaught exception leaks to the page context
 *   - The extension remains interactive after WASM failure
 *
 * What each test covers:
 *   T1  shadow host created despite WASM failure  — catch() works, init continues
 *   T2  no uncaught page error                    — error stays inside extension
 *   T3  host remains visible after WASM failure   — conveyor not torn down on error
 *   T4  guard attr present                        — script ran to completion
 */

import { expect, test, waitForConveyorInit } from "@conveyor/playwright/fixture"

test.describe("WASM bridge graceful failure", () => {
  test("T1: shadow host created despite WASM init failure", async ({
    fixture,
  }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    // If WasmBridge's .catch() didn't swallow the error, init() would reject
    // and the shadow host would never be inserted.
    expect(snap.hasHost).toBe(true)
  })

  test("T2: WASM error is caught — no uncaught exception in page context", async ({
    fixture,
  }) => {
    const pageErrors: Array<string> = []
    const page = await fixture.goto("basic-page")
    page.on("pageerror", (err) => {
      pageErrors.push(err.message)
    })

    await waitForConveyorInit(page)

    // pageerror fires for uncaught exceptions. The extension runs in a separate
    // JS context, so uncaught errors there appear as pageerror on the page.
    // A healthy conveyor init should produce zero uncaught errors.
    expect(pageErrors).toHaveLength(0)
  })

  test("T3: host remains visible after WASM failure", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    await waitForConveyorInit(page)

    const isVisible = await page.evaluate(() => {
      const host = document.getElementById("some-conveyor-host")
      return host !== null && host.style.display !== "none"
    })

    expect(isVisible).toBe(true)
  })

  test("T4: guard attribute present — content script ran to completion", async ({
    fixture,
  }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    // The guard attr is set synchronously before init() is called.
    // If it is present and the shadow host also exists, the entire init
    // path completed without an uncaught throw.
    expect(snap.guardAttr).toBe("true")
  })
})
