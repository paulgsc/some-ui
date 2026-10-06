/**
 * Redundant legacy re-application. Every page load's async init
 * reconciliation reaches enterOrRefreshLegacy() a second time, moments after
 * the cached paint applied the same config.
 *
 * applyLegacyFilter()'s `setAttribute(LEGACY_THEME_ATTR, "")` fires a real
 * MutationRecord even for an unchanged value (verified in isolation),
 * re-triggering every `[data-sw-legacy]` selector on the root filter's own
 * target. The headless harness has not reproduced a visible frame from it,
 * but real composited Chrome may, so this checks what is measurable: zero
 * DOM writes on a redundant call (the standard #831 holds enablePrepaint()
 * to).
 *
 * Classification (#1360): internal-state claims. The mutation count is the
 * measurable proxy stated above; the reload test checks the injected
 * stylesheet's text (legacy-invert-regimes.spec.ts owns the pixel claim).
 */

import { LEGACY_PRESETS } from "@filter/lib/legacy-presets"
import { expect, test } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"

test("a redundant TOGGLE_FILTER with an unchanged config writes nothing to the legacy stylesheet", async ({
  context,
  fixture,
}) => {
  const page = await fixture.goto("transparent-page")
  const sw = await backgroundWorker(context)
  await enterLegacyMode(sw, "transparent-page.html", LEGACY_CONFIG)

  await page.waitForFunction(
    () => document.documentElement.hasAttribute("data-sw-legacy"),
    undefined,
    { timeout: 5_000, polling: 100 }
  )
  await page.waitForFunction(
    () => document.getElementById("__sw_prepaint_veil") === null,
    undefined,
    { timeout: 5_000, polling: 100 }
  )

  // page.evaluate() runs in the page's main world, where chrome.* is not
  // reachable; the observer lives there (it sees all DOM changes) and the
  // message goes through the real worker via chrome.tabs.sendMessage, the
  // route background.ts's tabs.onUpdated uses in practice.
  await page.evaluate(() => {
    const style = document.getElementById("__sw_legacy_filter")
    if (style === null) throw new Error("legacy stylesheet missing")

    const records: Array<MutationRecord> = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(style, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    // The <html> attribute set is part of the redundant call's cost too.
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-sw-legacy"],
    })

    Reflect.set(window, "__redundantReapplyRecords", records)
    Reflect.set(window, "__redundantReapplyObserver", observer)
  })

  const target = await sw.evaluate(async () => {
    // eslint-disable-next-line no-restricted-globals
    const tabs = await chrome.tabs.query({})
    const t = tabs.find((tab) => tab.url?.includes("transparent-page.html"))
    if (t?.id === undefined) throw new Error("no matching tab")
    return t.id
  })

  await sw.evaluate(
    async ({ tabId, config }) => {
      // eslint-disable-next-line no-restricted-globals
      await chrome.tabs.sendMessage(tabId, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config,
      })
    },
    { tabId: target, config: LEGACY_CONFIG }
  )

  const mutationCount = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const records = Reflect.get(window, "__redundantReapplyRecords")
    const observer = Reflect.get(window, "__redundantReapplyObserver")
    if (observer instanceof MutationObserver) observer.disconnect()
    return Array.isArray(records) ? records.length : -1
  })

  expect(
    mutationCount,
    "a redundant TOGGLE_FILTER carrying the config already applied must not touch the legacy stylesheet or the html attribute"
  ).toBe(0)
})

/**
 * Init reconciliation must compare the incoming config against the
 * module-level `filterConfig` *before* overwriting it. A reload re-enters
 * legacy with content.ts's default filter (only the state is cached, not the
 * config), so a tab whose stored style is "dim" must be corrected from
 * "invert".
 */
test("a reload's stale cached-default paint is still corrected to the real stored style", async ({
  context,
  fixture,
}) => {
  const page = await fixture.goto("transparent-page")
  const sw = await backgroundWorker(context)
  // "dim" is deliberately not content.ts's default (LEGACY_PRESETS.invert),
  // so the reload must repaint away from it.
  await enterLegacyMode(sw, "transparent-page.html", LEGACY_PRESETS.dim)

  await page.waitForFunction(
    () => document.documentElement.hasAttribute("data-sw-legacy"),
    undefined,
    { timeout: 5_000, polling: 100 }
  )

  await page.reload()

  await page.waitForFunction(
    () => document.documentElement.hasAttribute("data-sw-legacy"),
    undefined,
    { timeout: 5_000, polling: 100 }
  )
  // Give the async GET_TAB_FILTER_STATE reconciliation time to land and
  // (if working) correct the synchronous paint's stale default.
  await page.waitForTimeout(300)

  const css = await page.evaluate(
    () => document.getElementById("__sw_legacy_filter")?.textContent ?? ""
  )

  expect(css, `installed legacy stylesheet after reload: ${css}`).toContain(
    "invert(0)"
  )
  expect(css).toContain("brightness(0.7)")
  expect(css).not.toContain("invert(1)")
})
