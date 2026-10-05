/**
 * SPA-navigation repaint coverage on YouTube-shaped pages: a router that
 * dispatches `yt-navigate-start`/`yt-navigate-finish` around a same-document
 * route swap that can carry off part of `<head>`/`<body>` (reported live as
 * a white flash mid-session, in both auto and legacy).
 *
 * What these pin:
 *
 *   1. The veil is re-armed on nav-*start*, before the swap paints, not on
 *      finish (which can only shorten a flash).
 *   2. The handlers key off `currentState`, so legacy tabs and auto tabs
 *      whose first verdict was "no theme needed" are covered too.
 *   3. The legacy filter `<style>` is anchored on `<html>`, so a `<head>`
 *      swap cannot carry it off while `data-sw-legacy` survives (prepaint.css
 *      declares the legacy veil white on the premise the filter inverts it;
 *      without the filter that is a white flash).
 *
 * Classification (#1360):
 *   - The first and third `describe` blocks are visual claims checked only
 *     through DOM-presence proxies (the veil's existence), which a
 *     present-but-unpainted veil would also pass. That is what
 *     `frames.ts`'s `captureFrames`/`firstLeak` oracle is for; converting a
 *     synchronous swap assertion to frame capture is a known, unpromoted gap.
 *   - The second `describe` block is promoted: an independent computed-style
 *     luminance read backs its `hasDarkAttr` check.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import { churn } from "@filter/playwright/fixtures/hostile-page"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"

/** Matches issue-1268-sfad-shadow-theming.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3). */
const THEMED_LUMINANCE_CEILING = 0.3

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

    // One page.evaluate() so no frame can paint between the swap and the
    // DOM-state assertions. The pixel assertion is a separate step, since a
    // screenshot needs an actual paint.
    const duringSwap = await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))

      const veilPresentBeforeSwap =
        document.getElementById("__sw_prepaint_veil") !== null
      const dirtyBeforeSwap =
        document.documentElement.classList.contains("sw-dirty")

      // Stand-in for a router's document flush: replace <head> and <body>
      // wholesale (hostile-page.ts's churn.bodyHeadReplace() shape).
      const newHead = document.createElement("head")
      const newBody = document.createElement("body")
      newBody.innerHTML = '<div id="content-root"></div>'
      document.documentElement.replaceChild(newHead, document.head)
      document.documentElement.replaceChild(newBody, document.body)

      return {
        veilPresentBeforeSwap,
        dirtyBeforeSwap,
        legacyStyleSurvivedSwap:
          document.getElementById("__sw_legacy_filter") !== null,
        legacyAttrSurvivedSwap:
          document.documentElement.hasAttribute("data-sw-legacy"),
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
      duringSwap.legacyAttrSurvivedSwap,
      "data-sw-legacy lives on <html> itself and must survive a <head>/<body> swap either way " +
        "(precondition — otherwise this test isn't exercising the split-brain window at all)"
    ).toBe(true)
    expect(
      duringSwap.legacyStyleSurvivedSwap,
      "the legacy filter <style> is anchored on <html>, not <head>, and must survive a " +
        "<head> replacement — otherwise data-sw-legacy (surviving) and the veil's white " +
        "declaration (gated on it) go stale together, with nothing left to invert the veil back to dark"
    ).toBe(true)
    expect(
      duringSwap.veilSurvivedSwap,
      "the veil must still be covering the page immediately after the " +
        "swap, before yt-navigate-finish has even fired"
    ).toBe(true)

    // Not pixel-checked here: this veil is top-layer, and the headless
    // harness renders a white top-layer element as white under an ancestor
    // invert regardless (see prepaint.css's header), so a screenshot would
    // fail whether or not the fix is correct. The DOM assertions above are
    // the causal claim; the fallback rendering path is pixel-covered by
    // legacy-invert-regimes.spec.ts and by "the veil composites dark once
    // the legacy filter survives a <head> swap" below.

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
    // Precondition: the fixture reads already-dark, so the first round
    // applies no theme.
    expect(firstVerdict).toBe("none")

    // The route changes to something that needs theming — every surface the
    // first round evidenced, so the mean crosses pageAlreadyDark()'s
    // threshold — then the router announces finish.
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
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }))
    expect(resettled.hasDarkAttr).toBe(true)
    const rgba = parseColor(resettled.bodyBg)
    expect(
      rgba,
      `unparseable computed background-color: ${resettled.bodyBg}`
    ).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    expect(
      relativeLuminance(rgba[0], rgba[1], rgba[2]),
      `body background ${resettled.bodyBg} after the re-themed route — ` +
        `expected the dark canvas to actually be painted, not just declared`
    ).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })
})

// ── a mid-navigation pipeline reconcile round must not drop the veil early ──

test.describe("auto mode keeps the veil up through a mid-navigation reconcile round", () => {
  test("a vendor mutation between yt-navigate-start and yt-navigate-finish must not tear the veil down before the swap settles", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    const initial = await waitForClassification(page)
    expect(initial.themeApplied).toBe("dark")
    expect(initial.hasPrepaintVeil).toBe(false)

    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))
    })

    const rearmed = await page.evaluate(
      () => document.getElementById("__sw_prepaint_veil") !== null
    )
    expect(rearmed, "yt-navigate-start should re-arm the veil").toBe(true)

    // A vendor mutation mid-navigation: the pipeline's observer drives its
    // own debounced onFire round, which must not tear down the re-armed
    // veil; only yt-navigate-finish decides that.
    await churn.styleChurn(page)

    // Comfortably longer than the 50ms debounce so the coalesced round has
    // certainly run by the time this reads the veil back.
    await page.waitForTimeout(300)

    const duringNav = await page.evaluate(
      () => document.getElementById("__sw_prepaint_veil") !== null
    )
    expect(
      duringNav,
      "a pipeline reconcile round mid-navigation dropped the veil before " +
        "yt-navigate-finish settled the swap"
    ).toBe(true)

    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })

    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )
  })
})
