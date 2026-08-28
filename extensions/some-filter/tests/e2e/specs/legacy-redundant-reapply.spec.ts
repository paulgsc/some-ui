/**
 * Regression for a flash reported after the GET_TAB_FILTER_STATE fix (#1188)
 * started actually resolving: every page load's async init reconciliation
 * now genuinely reaches enterOrRefreshLegacy() a second time, moments after
 * the synchronous sessionStorage-cached paint already applied the same
 * config. Before that fix the response was always `undefined`, so this
 * second call never happened on Chrome — it was unreachable, not idempotent.
 *
 * enterOrRefreshLegacy()'s "already legacy" branch used to call
 * applyTheme("legacy", config) unconditionally whenever the tab was already
 * in legacy mode, trusting theme-apply.ts's setStyleText() to no-op an
 * unchanged rewrite. That guard is one step too late: applyLegacyFilter()
 * calls `setAttribute(LEGACY_THEME_ATTR, "")` before setStyleText ever
 * compares anything, and setAttribute has no same-value short-circuit — it
 * fires a real MutationRecord even when the attribute already holds that
 * exact value (verified directly, isolated from this extension entirely).
 * That re-triggers every selector gated on `[data-sw-legacy]` across two
 * stylesheets, on the element that is also the root filter's own target.
 * This sandbox's headless/swiftshader rendering hasn't reproduced a visible
 * frame from that churn (tried via CDP screencast on a real page.reload()),
 * but a real, hardware-composited Chrome may — a `filter`-bearing root
 * re-evaluating its own gated selectors is exactly the kind of thing
 * compositing layers are sensitive to. Checked here as what's actually
 * measurable: zero DOM writes on a redundant call, not zero pixels — the
 * same standard #831's veil test already holds enablePrepaint() to.
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

  // Playwright's page.evaluate() runs in the page's own main-world context,
  // not the content script's isolated world — chrome.* isn't reachable
  // there. The observer is set up in the page (MutationObserver sees DOM
  // changes regardless of which world caused them); the redundant message
  // itself goes through the real background service worker via
  // chrome.tabs.sendMessage, the same route background.ts's own
  // tabs.onUpdated handler uses to trigger this in practice.
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
    // The <html> attribute set is also part of the redundant call's cost —
    // watch it too, even though setAttribute to an unchanged value is
    // already a browser-level no-op mutation-wise.
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
 * Companion regression, caught by review on the fix above rather than
 * measured first: enterOrRefreshLegacy()'s no-op check compares the
 * module-level `filterConfig` against the incoming one, but content.ts's own
 * async init reconciliation used to overwrite that module-level value with
 * the incoming config *before* calling enterOrRefreshLegacy() — so the
 * comparison was always "config equals itself", regardless of what was
 * actually painted. On a reload, the synchronous sessionStorage-cached paint
 * always re-enters legacy mode with content.ts's own hardcoded default
 * filter (module state resets on every fresh injection; only the *state*
 * cache survives, not the config), so a tab whose real, stored style is
 * "dim" would reload showing "invert", reconcile, and then never actually
 * correct to "dim" — the too-early overwrite made the mismatch invisible to
 * the very check meant to catch it.
 */
test("a reload's stale cached-default paint is still corrected to the real stored style", async ({
  context,
  fixture,
}) => {
  const page = await fixture.goto("transparent-page")
  const sw = await backgroundWorker(context)
  // "dim" is deliberately not content.ts's own hardcoded default (which
  // matches LEGACY_PRESETS.invert) — the reload below must repaint away
  // from that default, not merely tolerate already being on it.
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
