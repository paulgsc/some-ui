/**
 * Prepaint-handshake E2E tests — Bug 1 triage suite.
 *
 * Bug 1: classify filter never applies on first page load.
 * Root cause hypothesis: findPrepaintSheet() fails to locate the extension
 * stylesheet, leaving prepaint.css active during classifyPage(). The html and
 * body elements read as rgb(13,17,23) from prepaint.css → avgLuminance ≈ 0.005
 * → isLight=false, skip=true → dark theme not applied.
 *
 * The fix (URL-based sheet detection via browser.runtime.getURL) should make
 * the prepaint sheet findable in a real browser context, something jsdom tests
 * cannot exercise (jsdom doesn't cascade extension stylesheets into
 * getComputedStyle).
 *
 * What each test diagnoses:
 *   T1  dark theme applied on light page       — primary pass/fail for Bug 1
 *   T2  luminance is not prepaint-poisoned     — distinguishes fix from luck
 *   T3  prepaint sheet is disabled             — verifies findPrepaintSheet() works
 *   T4  dark theme not applied on dark page    — regression guard
 *   T5  fallback bias on transparent page      — zero-sample path stays healthy
 *   T6  SPA repatch after yt-navigate-finish   — newly inserted nodes get tagged
 */

import { expect, test, waitForClassification } from "../fixture"

test.describe("prepaint handshake", () => {
  test("T1: light page → dark theme applied on first load", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    const snap = await waitForClassification(page)

    // Primary Bug 1 signal: if the prepaint sheet wasn't disabled before
    // classification, themeApplied will be "none" here.
    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)

    // Prepaint veil must drop (commitVisualState removes data-sw-prepaint).
    expect(snap.hasPrepaintAttr).toBe(false)
  })

  test("T2: luminance on light page is not prepaint-poisoned", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)

    const lum = await page.evaluate(() =>
      parseFloat(document.body.dataset["swLuminance"] ?? "0")
    )

    // Prepaint background is rgb(13,17,23) → luminance ≈ 0.005.
    // A correctly classified white page should read luminance ≫ 0.4.
    // If this assertion fails with lum ≈ 0.005, findPrepaintSheet() is still broken.
    expect(lum).toBeGreaterThan(0.4)
  })

  test("T3: prepaint sheet is disabled after classification", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)

    const disabled = await page.evaluate(() => {
      const prepaint = Array.from(document.styleSheets).find((s) =>
        s.href?.endsWith("prepaint.css")
      )
      // Return null if sheet not found at all (also a failure worth knowing).
      return prepaint != null ? prepaint.disabled : null
    })

    // null → sheet not found: findPrepaintSheet() couldn't locate it (Bug 1 still present)
    // false → sheet found but not disabled: withPrepaintSuppressed() not called or failed
    // true → correct: sheet found and permanently disabled
    expect(disabled).toBe(true)
  })

  test("T4: dark page → dark theme not applied, veil drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("none")
    expect(snap.hasDarkAttr).toBe(false)

    // Veil still drops even when the dark theme isn't applied (disablePrepaint path).
    expect(snap.hasPrepaintAttr).toBe(false)
  })

  test("T5: transparent page → dark theme applied via zero-sample fallback", async ({
    fixture,
  }) => {
    // classifyPage() returns { isLight: true, skip: false, avgLuminance: null }
    // when no element has an opaque background. The classifier biases toward
    // applying the dark theme on ambiguous pages.
    const page = await fixture.goto("transparent-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)
    expect(snap.hasPrepaintAttr).toBe(false)

    // avgLuminance should be null / "unknown" since no opaque samples exist.
    expect(snap.luminance).toBe("unknown")
  })

  test("T6: SPA repatch — new nodes tagged after yt-navigate-finish", async ({
    fixture,
  }) => {
    // The content script is not re-run on SPA navigation; instead it listens
    // for yt-navigate-finish and calls repatchPage() to classify new nodes.
    const page = await fixture.goto("light-page")
    await waitForClassification(page)

    // Inject a new white element to simulate SPA content insertion.
    await page.evaluate(() => {
      const div = document.createElement("div")
      div.style.backgroundColor = "rgb(255, 255, 255)"
      div.id = "spa-node"
      document.body.appendChild(div)
    })

    // Dispatch the navigation event that triggers repatchPage().
    await page.evaluate(() =>
      window.dispatchEvent(new Event("yt-navigate-finish"))
    )

    // The new node should receive data-sw-patched="surface" (lum ≈ 1 > 0.7).
    await page.waitForFunction(
      () =>
        document.getElementById("spa-node")?.dataset["swPatched"] !== undefined,
      { timeout: 2_000 }
    )

    const patched = await page.evaluate(
      () => document.getElementById("spa-node")?.dataset["swPatched"]
    )
    expect(patched).toBe("surface")
  })
})
