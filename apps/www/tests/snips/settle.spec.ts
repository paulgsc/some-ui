/**
 * SN2 (#3491): the capture photographs no screen still reading. Its wait,
 * `settle`, in a real Chromium: a screen with nothing reading settles at
 * once; one whose reading line goes after a while settles once it has gone,
 * though nothing the page's network shows marks the read (the app's reads
 * of home go through the phone's own HTTP); one that never stops reading
 * is refused, so `walk` lists it as unreached and takes no picture.
 */

import { expect, test } from "@playwright/test"

import { settle } from "./capture"

/** A screen whose reading line (`Reading`, `@some-ui/shared`) goes after `ms`, or never. */
const screenReading = (ms: number | null): string => `
  <main>
    <p aria-busy="true" id="reading">Asking home…</p>
    ${
      ms === null
        ? ""
        : `<script>setTimeout(() => {
            document.getElementById("reading").replaceWith(
              Object.assign(document.createElement("p"), { textContent: "Renders" })
            )
          }, ${String(ms)})</script>`
    }
  </main>`

test.describe("the capture's wait for a screen to read (SN2)", () => {
  test("settles at once when nothing is reading", async ({ page }) => {
    await page.setContent("<main><h1>Renders</h1></main>")
    expect(await settle(page, 1_000)).toBe(true)
  })

  test("waits for a read its network never shows, and settles once it has landed", async ({
    page,
  }) => {
    // Longer than the beat `settle` takes after a screen has read (2.5 s), so
    // only the wait for the reading line explains its going.
    await page.setContent(screenReading(4_000))
    const from = Date.now()
    expect(await settle(page, 8_000)).toBe(true)
    expect(Date.now() - from).toBeGreaterThanOrEqual(4_000)
    expect(await page.locator('[aria-busy="true"]').count()).toBe(0)
  })

  test("refuses a screen still reading at its bound", async ({ page }) => {
    await page.setContent(screenReading(null))
    expect(await settle(page, 1_000)).toBe(false)
  })
})
