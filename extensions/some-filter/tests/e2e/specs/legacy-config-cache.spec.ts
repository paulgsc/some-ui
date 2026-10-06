/**
 * Init reconciliation must keep content.ts's cached `filterConfig` current
 * even when nothing else needs reconciling (background agrees the tab is not
 * legacy). cycleState() — the keyboard shortcut — paints with that cache and
 * carries no config, so a stale default would paint "invert" for a user
 * whose chosen style is "dim".
 *
 * This path also depends on background.ts's GET_TAB_FILTER_STATE actually
 * calling `sendResponse` on Chrome; without it the assertions fail
 * regardless.
 *
 * Classification (#1360): internal-state claim. The assertions read the
 * injected style's literal text (which config string got written);
 * legacy-invert-regimes.spec.ts owns the pixel claim.
 */

import { expect, test } from "@filter/playwright/fixture"
import { backgroundWorker } from "@filter/playwright/fixtures/legacy-mode"

test("a tab left in auto still picks up the user's chosen legacy style on keyboard-cycled entry", async ({
  context,
  fixture,
}) => {
  const sw = await backgroundWorker(context)

  // The user's standing choice is "dim", set before this tab loads.
  await sw.evaluate(async () => {
    // onInstalled fires on every fresh --load-extension launch and
    // fire-and-forgets a write of the defaults (legacyStyle: "invert"), which
    // could race this one. Wait for the default write, then overwrite it.
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-restricted-globals
      const { legacyStyle } = await chrome.storage.local.get(["legacyStyle"])
      if (legacyStyle !== undefined) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    // eslint-disable-next-line no-restricted-globals
    await chrome.storage.local.set({
      legacyStyle: "dim",
      filterConfig: {
        invert: 0,
        hueRotate: 0,
        sepia: 0,
        brightness: 0.7,
        contrast: 0.95,
      },
      filteredTabIds: [],
      tabStates: {},
    })
  })

  const page = await fixture.goto("transparent-page")

  await page.waitForFunction(
    () => document.body.dataset["swThemeApplied"] !== undefined,
    undefined,
    { timeout: 5_000, polling: 100 }
  )

  // Give the async GET_TAB_FILTER_STATE round trip (the reconciliation this
  // regression lives in) time to land before cycling.
  await page.waitForTimeout(300)

  // Keyboard cycle: auto -> off -> legacy via CYCLE_TAB_STATE, which carries
  // no config.
  const target = await sw.evaluate(async () => {
    // eslint-disable-next-line no-restricted-globals
    const tabs = await chrome.tabs.query({})
    const t = tabs.find((tab) => tab.url?.includes("transparent-page.html"))
    if (t?.id === undefined) throw new Error("no matching tab")
    return t.id
  })

  for (let i = 0; i < 2; i++) {
    await sw.evaluate(async (tabId) => {
      // eslint-disable-next-line no-restricted-globals
      await chrome.tabs.sendMessage(tabId, { type: "CYCLE_TAB_STATE" })
    }, target)
    await page.waitForTimeout(150)
  }

  await page.waitForFunction(
    () => document.documentElement.hasAttribute("data-sw-legacy"),
    undefined,
    { timeout: 5_000, polling: 100 }
  )

  const css = await page.evaluate(
    () => document.getElementById("__sw_legacy_filter")?.textContent ?? ""
  )

  expect(css, `installed legacy stylesheet: ${css}`).toContain("invert(0)")
  expect(css).toContain("brightness(0.7)")
  expect(css).not.toContain("invert(1)")
})
