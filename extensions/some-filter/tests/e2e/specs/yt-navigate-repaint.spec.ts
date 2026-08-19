/**
 * SPA-navigation repaint coverage on YouTube-shaped pages — a page whose own
 * router dispatches `yt-navigate-start`/`yt-navigate-finish` around a
 * same-document route swap that can carry off part of `<head>`/`<body>`
 * (reported live: a visible white flash mid-session, on a page that never
 * actually refreshed, in *both* auto and legacy mode).
 *
 * Two bugs, traced to content.ts's `yt-navigate-finish` listener:
 *
 *   1. It re-armed the veil (`enablePrepaint()`) itself, on *finish* — after
 *      the router's swap has already painted natively for at least one
 *      frame. Reacting only once the churn is already visible can shorten a
 *      flash, never prevent it.
 *   2. The whole handler was gated on `autoWasApplied`, a flag only ever set
 *      from inside auto mode's own onFire callback. Legacy-mode tabs (this
 *      spec) and any auto-mode tab whose very first verdict was "no theme
 *      needed" got zero protection from this event for the rest of the
 *      tab's life — the swap could carry off the extension's injected
 *      `<style>` tag with nothing to restore it.
 *
 * The fix splits the handler in two: `yt-navigate-start` re-arms the veil
 * *before* the swap (covering the churn itself, not just its aftermath),
 * and `yt-navigate-finish` settles whichever mode is active (`currentState`,
 * not `autoWasApplied`) once the swap has landed.
 */

import { expect, test } from "@filter/playwright/fixture"
import type { Worker } from "@playwright/test"

const LEGACY_CONFIG = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

/** Chromium's MV3 background service worker — the extension's real code path for entering legacy mode, exercised here instead of poking sessionStorage directly so this proves the same route a user's popup click takes. */
async function backgroundWorker(context: {
  serviceWorkers(): ReadonlyArray<Worker>
  waitForEvent(event: "serviceworker"): Promise<Worker>
}): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  return existing ?? context.waitForEvent("serviceworker")
}

/** Puts `page`'s tab into legacy mode via the same storage + TOGGLE_FILTER message background.ts's popup-driven `applyLegacyStyle`/tab-lifecycle paths use — not a content.ts-internal shortcut. */
async function enterLegacyMode(
  sw: Worker,
  urlSubstring: string,
  config: typeof LEGACY_CONFIG
): Promise<void> {
  // This runs inside the extension's own MV3 service worker via CDP, not
  // through this repo's module graph — `@filter/platform`'s browser.*
  // wrapper isn't reachable here, and the fixture (tests/e2e/fixture.ts)
  // is Chromium-only by design, so the raw chrome.* API is the correct
  // (only) tool for the job.
  await sw.evaluate(
    async ({ urlSubstring, config }) => {
      // eslint-disable-next-line no-restricted-globals
      const tabs = await chrome.tabs.query({})
      const target = tabs.find((t) => t.url?.includes(urlSubstring))
      if (target?.id === undefined) {
        throw new Error(`no open tab matching "${urlSubstring}"`)
      }
      // eslint-disable-next-line no-restricted-globals
      await chrome.storage.local.set({
        filteredTabIds: [target.id],
        tabStates: { [target.id]: "legacy" },
        filterConfig: config,
      })
      // eslint-disable-next-line no-restricted-globals
      await chrome.tabs.sendMessage(target.id, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config,
      })
    },
    { urlSubstring, config }
  )
}

test.describe("legacy mode survives a yt-navigate-* head/body swap", () => {
  test("the veil covers the swap and the legacy filter is restored, with no unveiled native frame in between", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "hostile-page.html", LEGACY_CONFIG)

    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    // Everything from here happens inside one page.evaluate() call so no
    // frame can paint between the router "tearing down" the outgoing route
    // (the head/body swap, standing in for whatever YouTube's own flush
    // does) and the assertions below — the same reasoning
    // issue-741-auto-defects.spec.ts's veil test documents for why a
    // synchronous evaluate is required to observe a pre-rAF DOM state.
    const duringSwap = await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))

      const veilPresentBeforeSwap =
        document.getElementById("__sw_prepaint_veil") !== null
      const dirtyBeforeSwap =
        document.documentElement.classList.contains("sw-dirty")

      // Stand-in for a vendor router's own document flush: replace <head>
      // (carrying off the injected __sw_legacy_filter <style> tag) and
      // <body> wholesale, same shape as hostile-page.ts's
      // churn.bodyHeadReplace().
      const newHead = document.createElement("head")
      const newBody = document.createElement("body")
      newBody.innerHTML = '<div id="content-root"></div>'
      document.documentElement.replaceChild(newHead, document.head)
      document.documentElement.replaceChild(newBody, document.body)

      return {
        veilPresentBeforeSwap,
        dirtyBeforeSwap,
        legacyStyleGoneAfterSwap:
          document.getElementById("__sw_legacy_filter") === null,
        // The veil is anchored to <html>, not <body> — a body replaceChild
        // cannot remove it (prepaint.ts's whole reason for anchoring there).
        veilSurvivedSwap:
          document.getElementById("__sw_prepaint_veil") !== null,
      }
    })

    expect(
      duringSwap.veilPresentBeforeSwap,
      "yt-navigate-start should re-arm the veil before the swap runs"
    ).toBe(true)
    expect(duringSwap.dirtyBeforeSwap).toBe(true)
    expect(
      duringSwap.legacyStyleGoneAfterSwap,
      "the fixture's head replace should carry off the injected <style> tag " +
        "(precondition — otherwise this test isn't exercising the swap at all)"
    ).toBe(true)
    expect(
      duringSwap.veilSurvivedSwap,
      "the veil must still be covering the page immediately after the " +
        "swap, before yt-navigate-finish has even fired"
    ).toBe(true)

    // Settle: yt-navigate-finish should notice the legacy filter is gone
    // and re-inject it.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })

    await page.waitForFunction(
      () => document.getElementById("__sw_legacy_filter") !== null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const settled = await page.evaluate(() => ({
      hasLegacyAttr: document.documentElement.hasAttribute("data-sw-legacy"),
      filterCss:
        document.getElementById("__sw_legacy_filter")?.textContent ?? "",
    }))

    expect(settled.hasLegacyAttr).toBe(true)
    expect(settled.filterCss).toContain("invert(1)")

    // commitVisualState()'s rAF pair lifts the veil once the re-applied
    // filter has painted at least once.
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )
  })
})

test.describe("auto mode keeps rescanning on yt-navigate-finish after a 'no theme needed' verdict", () => {
  test("a later route that does need theming is still picked up, even though the first verdict was already-dark", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-hostile-page")

    await page.waitForFunction(
      () => document.body.dataset["swThemeApplied"] !== undefined,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const firstVerdict = await page.evaluate(
      () => document.body.dataset["swThemeApplied"]
    )
    // Precondition: the fixture's own colors read as already-dark, so the
    // very first round leaves autoWasApplied === false in the pre-fix code
    // — exactly the state that used to permanently disable this handler.
    expect(firstVerdict).toBe("none")

    // The route "changes" under the same document to something that does
    // need theming — every surface the pipeline evidenced on the first
    // round, not just one, so the new unweighted mean actually crosses
    // decide()'s pageAlreadyDark() threshold — then the router announces it
    // finished navigating.
    await page.evaluate(() => {
      for (const el of [
        document.body,
        ...document.querySelectorAll("main, #card, #panel, #strip"),
      ]) {
        if (el instanceof HTMLElement) {
          el.style.backgroundColor = "rgb(255, 255, 255)"
        }
      }
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })

    await page.waitForFunction(
      () => document.body.dataset["swThemeApplied"] === "dark",
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const resettled = await page.evaluate(() => ({
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
    }))
    expect(resettled.hasDarkAttr).toBe(true)
  })
})
