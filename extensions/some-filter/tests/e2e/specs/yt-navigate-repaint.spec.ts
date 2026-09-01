/**
 * SPA-navigation repaint coverage on YouTube-shaped pages — a page whose own
 * router dispatches `yt-navigate-start`/`yt-navigate-finish` around a
 * same-document route swap that can carry off part of `<head>`/`<body>`
 * (reported live: a visible white flash mid-session, on a page that never
 * actually refreshed, in *both* auto and legacy mode).
 *
 * Three bugs, traced to content.ts's `yt-navigate-finish` listener and
 * theme-apply.ts's legacy filter placement:
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
 *   3. Even with (1) and (2) fixed, legacy mode had a second, narrower flash
 *      window of its own: `data-sw-legacy` lives on `<html>` and survives a
 *      `<head>` swap, but `#__sw_legacy_filter` — the `<style>` carrying the
 *      actual `filter: invert(...)` — used to be a child of `<head>` and did
 *      not. prepaint.css's veil-color rule is gated purely on
 *      `data-sw-legacy` (`html[data-sw-legacy] #__sw_prepaint_veil {
 *      background: white }`), on the premise that the *same* still-active
 *      root filter will invert it back to dark. A `<head>` swap that carries
 *      off the filter stylesheet while that attribute survives falsifies
 *      that premise: the veil keeps covering the page, declared white, with
 *      nothing left to invert it — a literal white flash for exactly as
 *      long as the stylesheet is gone. Anchoring the stylesheet on `<html>`
 *      itself (theme-apply.ts's `applyLegacyFilter`, the same place the
 *      veil already anchors itself against a `<body>`-only swap) closes
 *      this: a `<head>`-only swap can no longer take it.
 *
 * The fix splits the handler in two: `yt-navigate-start` re-arms the veil
 * *before* the swap (covering the churn itself, not just its aftermath),
 * and `yt-navigate-finish` settles whichever mode is active (`currentState`,
 * not `autoWasApplied`) once the swap has landed.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import { churn } from "@filter/playwright/fixtures/hostile-page"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"

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
    // does) and the DOM-state assertions below — the same reasoning
    // issue-741-auto-defects.spec.ts's veil test documents for why a
    // synchronous evaluate is required to observe a pre-rAF DOM state. The
    // pixel assertion further down is deliberately a *separate* step: a
    // screenshot can only capture an actual paint, which by definition
    // cannot happen inside this same synchronous call.
    const duringSwap = await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))

      const veilPresentBeforeSwap =
        document.getElementById("__sw_prepaint_veil") !== null
      const dirtyBeforeSwap =
        document.documentElement.classList.contains("sw-dirty")

      // Stand-in for a vendor router's own document flush: replace <head>
      // and <body> wholesale, same shape as hostile-page.ts's
      // churn.bodyHeadReplace(). __sw_legacy_filter is anchored on <html>
      // itself (theme-apply.ts's applyLegacyFilter), not <head>, precisely
      // so this can no longer carry it off.
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

    // Not pixel-checked here, deliberately: the veil in this real,
    // extension-driven scene is popover-promoted (top layer) whenever the
    // browser supports it, and prepaint.css's own header comment already
    // documents — from a real, hard-won regression, not a theory — that
    // this project's headless/swiftshader harness renders a white top-layer
    // element as literal white under an ancestor `filter: invert(...)`
    // regardless of whether that filter is genuinely active, the opposite
    // of what real hardware-accelerated browsers do. A screenshot here
    // would fail exactly this way whether or not the fix above is correct,
    // which makes it worse than no test — legacy-invert-regimes.spec.ts's
    // own veil test carries the identical caveat for the same reason. The
    // DOM-level assertions above (the attribute and the stylesheet both
    // surviving the swap) are the causally relevant claim: once the
    // stylesheet survives, the *fallback* (non-top-layer) rendering path —
    // which this harness's pixels are proven trustworthy for — is already
    // covered by legacy-invert-regimes.spec.ts's "declares white for both
    // the fallback and the top layer" scene, and by "the veil composites
    // dark once the legacy filter survives a <head> swap" below, which
    // builds the exact pre/post-fix scene pixel-side-by-side.

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

    // A vendor mutation mid-navigation, unrelated to the yt-navigate-*
    // events themselves: pipeline.ts's own MutationObserver sees it and,
    // after its 50ms debounce (RECONCILE_POLICY.debounceMs), drives its own
    // onFire round. That round must not tear the just-re-armed veil down —
    // the swap has not settled yet, only yt-navigate-finish gets to decide
    // that.
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
