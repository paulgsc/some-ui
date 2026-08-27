/**
 * Regression for a review finding on the TOGGLE_FILTER-idempotency fix
 * (content.ts's enterOrRefreshLegacy refactor): the async init reconciliation
 * used to write `filterConfig = response.config` unconditionally, once, before
 * branching on `response.enabled`. The refactor moved that assignment inside
 * the branches — dropping it for exactly the case where the background
 * confirms the tab is *not* in legacy mode and it already wasn't: nothing to
 * reconcile, so neither branch ran, and content.ts's local filterConfig cache
 * was left at its stale module-level default.
 *
 * That cache is what cycleState() (the keyboard shortcut's CYCLE_TAB_STATE
 * handler) paints with — it carries no config of its own. So a tab sitting
 * in "auto" while the user's chosen legacy style is "dim" would, on the next
 * keyboard-cycled entry into legacy mode, paint with the default "invert"
 * preset instead — silently reverting the user's choice for exactly the one
 * entry point (the keyboard shortcut) that doesn't carry a config payload.
 *
 * Exercising this also surfaced a second, pre-existing, independent bug this
 * test would otherwise have masked: background.ts's GET_TAB_FILTER_STATE
 * handler never actually responded to its caller on Chrome (`void handler();
 * return true` with no `sendResponse` ever captured or called), so this
 * whole reconciliation path was unreachable dead code before that was also
 * fixed. Without it, isGetTabFilterStateResponse(response) is always false
 * against an eternally-unresolved response, and the assertions below fail
 * the same way regardless of whether the filterConfig fix is present.
 */

import { expect, test } from "@filter/playwright/fixture"
import { backgroundWorker } from "@filter/playwright/fixtures/legacy-mode"

test("a tab left in auto still picks up the user's chosen legacy style on keyboard-cycled entry", async ({
  context,
  fixture,
}) => {
  const sw = await backgroundWorker(context)

  // The user's standing choice is "dim", set before this tab ever loads —
  // mirrors picking the style once via the popup/context menu, then later
  // opening (or leaving idle in auto) a tab that never itself toggled legacy.
  await sw.evaluate(async () => {
    // ext.runtime.onInstalled fires again on every fresh --load-extension
    // launch (a new persistent context is a fresh install), and its own
    // handler fire-and-forgets a storage.local.set() of the module defaults
    // — including legacyStyle: "invert", the exact value this test needs
    // to NOT be sitting in storage. backgroundWorker(context) only waits
    // for the service worker to exist, not for that handler's promise to
    // settle, so writing "dim" immediately below can race it and lose.
    // Wait for the default write to land first (bounded poll), then
    // overwrite it — the only ordering this test can rely on.
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

  // Keyboard cycle: auto -> off -> legacy (tab-state.ts's STATE_CYCLE), the
  // same CYCLE_TAB_STATE message ext.commands.onCommand sends — carries no
  // config, relies entirely on content.ts's own cached filterConfig.
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
