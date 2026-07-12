import { expect, test } from "@playwright/test"

import { churn, hostilePageHtml } from "../fixtures/hostile-page"

const HARNESS_BUNDLE = "tests/e2e/harness/dist/entry.js"

test.beforeEach(async ({ page }) => {
  await page.setContent(hostilePageHtml())
  await page.addScriptTag({ path: HARNESS_BUNDLE })
})

test.describe("Hostile removal of actuator-owned DOM (Remark 7.2's ownership-signal path)", () => {
  test("a vendor script removing an owned node is distinguished from our own teardown, and only the former re-asserts", async ({
    page,
  }) => {
    await page.evaluate(() => window.__transport.markPresence("k1"))
    expect(await page.evaluate(() => window.__transport.isPresent("k1"))).toBe(
      true
    )

    await page.evaluate(() => window.__transport.hostileRemove("k1"))
    expect(await page.evaluate(() => window.__transport.isPresent("k1"))).toBe(
      false
    )

    const reasserted = await page.evaluate(() =>
      window.__transport.reassertIfRemovedByVendor("k1")
    )
    expect(reasserted).toBe(true)
    expect(await page.evaluate(() => window.__transport.isPresent("k1"))).toBe(
      true
    )
  })

  test("our own intentional removal does not trigger a re-assert", async ({
    page,
  }) => {
    await page.evaluate(() => window.__transport.markPresence("k2"))
    await page.evaluate(() => window.__transport.intentionallyRemove("k2"))
    expect(await page.evaluate(() => window.__transport.isPresent("k2"))).toBe(
      false
    )

    const reasserted = await page.evaluate(() =>
      window.__transport.reassertIfRemovedByVendor("k2")
    )
    expect(reasserted).toBe(false)
    expect(await page.evaluate(() => window.__transport.isPresent("k2"))).toBe(
      false
    )
  })
})

test.describe("Full teardown", () => {
  test("no dangling listeners/observers/timers after teardownContentSession()", async ({
    page,
  }) => {
    await page.addScriptTag({ path: HARNESS_BUNDLE })
    await page.evaluate(
      (selector) => window.__transport.startSensing(selector),
      "#content-root"
    )

    // Generate a burst of evidence to schedule a pending reconcile timer.
    await churn.virtualizedRecycle(page, "#content-root", "k1", 1)

    await page.evaluate(() => window.__transport.teardownContentSession())

    const reconcileCountBefore = await page.evaluate(() =>
      window.__transport.reconcileCount()
    )

    // Further mutation after teardown must produce no further evidence —
    // the MutationObserver was disconnected, not merely paused.
    await churn.virtualizedRecycle(page, "#content-root", "k1", 2)
    await page.waitForTimeout(100)

    const reconcileCountAfter = await page.evaluate(() =>
      window.__transport.reconcileCount()
    )
    expect(reconcileCountAfter).toBe(reconcileCountBefore)

    // No pending coalescer timer survives teardown.
    const fired = await page.evaluate(() =>
      window.__transport.pendingTimerFired()
    )
    expect(fired).toBe(false)
  })

  test("page unload leaves no uncaught exception from any live handle", async ({
    page,
  }) => {
    await page.addScriptTag({ path: HARNESS_BUNDLE })
    await page.evaluate(
      (selector) => window.__transport.startSensing(selector),
      "#content-root"
    )

    const pageErrors: Array<string> = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await page.evaluate(() => window.__transport.teardownDocumentSession())
    await page.goto("about:blank")

    expect(pageErrors).toEqual([])
  })
})
