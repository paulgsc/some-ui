/**
 * Conveyor shadow-DOM init E2E tests.
 *
 * These tests verify that the content script correctly:
 *   - Sets the duplicate-injection guard on <html>
 *   - Creates and appends the shadow host element to document.body
 *   - Decorates the host with the expected attributes and inline styles
 *
 * None of these tests exercise WASM (see wasm-bridge.spec.ts) — they confirm
 * the synchronous scaffolding that every content-script run produces.
 *
 * What each test covers:
 *   T1  guard attr present on <html>          — duplicate injection prevention
 *   T2  shadow host inserted with correct id  — ShadowHost constructor ran
 *   T3  host has data-some-conveyor attr      — attribute contract
 *   T4  host has z-index 2147483640           — z-index policy
 *   T5  host has fixed positioning            — viewport overlay is correct
 */

import { expect, test, waitForConveyorInit } from "../fixture"

test.describe("conveyor shadow DOM init", () => {
  test("T1: guard attribute set on <html> element", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    expect(snap.guardAttr).toBe("true")
  })

  test("T2: shadow host element inserted with correct id", async ({
    fixture,
  }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    expect(snap.hasHost).toBe(true)
  })

  test("T3: shadow host has data-some-conveyor attribute", async ({
    fixture,
  }) => {
    const page = await fixture.goto("basic-page")
    const snap = await waitForConveyorInit(page)

    expect(snap.hostDataAttr).toBe("true")
  })

  test("T4: shadow host has z-index 2147483640", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    await waitForConveyorInit(page)

    const zIndex = await page.evaluate(() => {
      const host = document.getElementById("some-conveyor-host")
      return host ? host.style.zIndex : null
    })

    expect(zIndex).toBe("2147483640")
  })

  test("T5: shadow host has fixed positioning", async ({ fixture }) => {
    const page = await fixture.goto("basic-page")
    await waitForConveyorInit(page)

    const position = await page.evaluate(() => {
      const host = document.getElementById("some-conveyor-host")
      return host ? host.style.position : null
    })

    expect(position).toBe("fixed")
  })
})
