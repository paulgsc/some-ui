/**
 * Exogenous self-reload resilience — reproduces a real-world pattern
 * reported from live YouTube (exact vendor trigger unconfirmed, no network
 * access to youtube.com from this suite): the page loads and paints once,
 * then the page's OWN script fires a full reload shortly after, giving the
 * content script a second document_start/document_end cycle on a fresh
 * document. Reported symptom: prepaint covers correctly on both loads, but
 * the settled state after the SECOND load shows native (light) background
 * instead of the extension's dark theme.
 *
 * fixtures/exogenous-reload-page.html drives exactly that shape (a plain
 * light page that reloads itself once, sessionStorage-gated). This can't
 * confirm what YouTube itself is doing internally — only that our pipeline
 * correctly recovers from the general "a page reloads itself shortly after
 * initial paint" pattern, which is the useful, reproducible proxy for it.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"

test.describe("exogenous self-reload resilience", () => {
  test("settles to the themed dark canvas after the page reloads itself shortly after initial paint", async ({
    fixture,
  }) => {
    const page = await fixture.goto("exogenous-reload-page")

    // fixture.goto() already waited out the *first* load internally (via
    // page.goto()'s own default waitUntil). Set up this listener immediately
    // after it returns — well within the fixture's own 200ms reload delay —
    // so it can only match the second, self-triggered load, never race with
    // the one goto() already consumed.
    await page.waitForEvent("load")

    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)
    expect(snap.hasPrepaintVeil).toBe(false)
  })
})
