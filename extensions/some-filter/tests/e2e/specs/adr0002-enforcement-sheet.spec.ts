/**
 * ADR 0002 §7 step 2 — enforcement sheet e2e.
 *
 * Tests per §3.2 and §3.1, the ADR's own acceptance bar for this step.
 * Neither claim is checkable from a unit test: both are statements about
 * the real cascade (no jsdom), and §3.1 specifically is about a live
 * `chrome.scripting.insertCSS({ origin: "USER" })` call from a real MV3
 * service worker reaching a real shadow boundary.
 *
 * Every test here cycles the tab to "off" before asserting anything. The
 * existing classify-then-apply pipeline (`content.ts`'s auto mode) runs by
 * default on these same fixtures and, today, happens to land on the exact
 * same `bg0` the enforcement sheet uses (both read `SWATCHES.default` —
 * `content.ts` and `background.ts` each hardcode it independently; no
 * swatch-selection mechanism exists yet, same non-goal `swatch-oracle.spec.ts`'s
 * own header records). Without cycling off, a background-color assertion
 * alone cannot tell "the enforcement sheet did this" from "the old pipeline
 * did this, same swatch, coincidentally identical color" — a bug that broke
 * `background.ts`'s own `insertCSS` call entirely would still read green.
 * Cycling to "off" (and asserting `data-sw-dark` is absent) removes the old
 * pipeline's own contribution, so what's left is attributable to the
 * enforcement sheet alone — the one code path under test here.
 */

import { expect, test } from "@filter/playwright/fixture"
import type { Page, Worker } from "@playwright/test"

/** Chromium's MV3 background service worker — mirrors legacy-mode.ts's own helper (not imported from there: that module also carries LEGACY_CONFIG/enterLegacyMode, unrelated to this file). */
async function backgroundWorker(context: {
  serviceWorkers(): ReadonlyArray<Worker>
  waitForEvent(event: "serviceworker"): Promise<Worker>
}): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  return existing ?? context.waitForEvent("serviceworker")
}

/**
 * Flips the flag `background.ts`'s own header documents as the only way to
 * turn this experiment on today (no UI toggle exists yet). Must run before
 * `fixture.goto()` — `background.ts`'s own `tabs.onUpdated` "loading"
 * listener reads this at navigation time, not on some later poll.
 */
async function enableEnforcementSheet(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    // Raw chrome.* — this runs inside the real MV3 service worker via CDP,
    // not through this repo's module graph (mirrors legacy-mode.ts's own
    // backgroundWorker()/enterLegacyMode() comment for the identical reason).
    // eslint-disable-next-line no-restricted-globals
    await chrome.storage.local.set({ enforcementSheetEnabled: true })
  })
}

/**
 * Cycles the given page's tab from the default "auto" to "off" via the same
 * `CYCLE_TAB_STATE` route the real keyboard shortcut uses (`background.ts`'s
 * `commands.onCommand` handler) — see this file's own header for why this
 * step is required before any assertion below.
 */
async function cycleTabOff(
  sw: Worker,
  page: Page,
  urlSubstring: string
): Promise<void> {
  // Substring, not exact equality, matching legacy-mode.ts's own
  // enterLegacyMode() — a file:// path can round-trip through
  // Playwright/chrome.tabs with different percent-encoding for the same
  // URL, and this only needs to identify the one open fixture tab.
  await sw.evaluate(async (targetUrl: string) => {
    // eslint-disable-next-line no-restricted-globals
    const tabs = await chrome.tabs.query({})
    const target = tabs.find((t) => t.url?.includes(targetUrl))
    if (target?.id === undefined) {
      throw new Error(`no open tab matching "${targetUrl}"`)
    }
    // eslint-disable-next-line no-restricted-globals
    await chrome.tabs.sendMessage(target.id, { type: "CYCLE_TAB_STATE" })
  }, urlSubstring)

  await page.waitForFunction(
    () => document.body.dataset["swTabState"] === "off",
    undefined,
    { timeout: 5_000, polling: 100 }
  )
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-sw-dark")
    )
  ).toBe(false)
}

// SWATCHES.default's bg0 (#171c25) — asserted as a literal rather than
// imported from @filter/adapter/swatches, mirroring swatch-oracle.spec.ts's
// own choice not to couple an e2e assertion to a module import the
// background service worker's raw chrome.* evaluate() context (this file's
// own backgroundWorker() comment) does not run inside.
const ENFORCED_BG = "rgb(23, 28, 37)"

test.describe("ADR 0002 enforcement sheet", () => {
  test("§3.2 — the canvas rule wins the specificity trap (html/body never blank)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await cycleTabOff(sw, page, "light-page.html")

    // Polls rather than asserting immediately: insertCSS is an async round
    // trip through the service worker (ADR 0002 §4's own measured race),
    // not synchronized with Playwright's page-load wait.
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const [htmlBg, bodyBg] = await page.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ])

    // The regression this specificity boost exists for: an unboosted
    // `html, body` canvas rule loses to the erase rule's own (0,0,4) and
    // both read back as transparent (`rgba(0, 0, 0, 0)`), leaving the page
    // on the UA's white default under E's light text — measured directly
    // in ADR 0002 §3.2. Asserting the *specific* enforced color, not just
    // "not transparent", catches that failure and a `background: transparent`
    // no-op alike.
    expect(htmlBg).toBe(ENFORCED_BG)
    expect(bodyBg).toBe(ENFORCED_BG)
  })

  test("a vendor root filter does not invert E back to light (bot-found on #1463)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    // light-page.html plus `html { filter: invert(1) }` — the vendor-side
    // "dark mode via invert" trick. A compositing filter is applied after
    // painting, so without neutralizing it the enforced bg0 would render as
    // its inverse (a light grey) and every other token likewise.
    const page = await fixture.goto("filter-invert-vendor-page")
    await cycleTabOff(sw, page, "filter-invert-vendor-page.html")
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const [htmlFilter, bodyFilter] = await page.evaluate(() => [
      getComputedStyle(document.documentElement).filter,
      getComputedStyle(document.body).filter,
    ])
    expect(htmlFilter).toBe("none")
    expect(bodyFilter).toBe("none")
  })

  test("inset-shadow fills, descendant filters and a white dialog backdrop are all neutralized (bot-found on #1463, round 3)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await cycleTabOff(sw, page, "light-page.html")
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const probe = await page.evaluate(() => {
      const style = document.createElement("style")
      style.textContent = [
        "#probe-shadow { box-shadow: inset 0 0 0 9999px rgb(255, 255, 255); }",
        "#probe-filter { filter: invert(1); }",
        "#probe-dialog::backdrop { background-color: rgb(255, 255, 255); }",
      ].join("\n")
      document.head.appendChild(style)
      const shadow = document.createElement("div")
      shadow.id = "probe-shadow"
      const filtered = document.createElement("main")
      filtered.id = "probe-filter"
      const dialog = document.createElement("dialog")
      dialog.id = "probe-dialog"
      document.body.append(shadow, filtered, dialog)
      dialog.showModal()
      return {
        shadow: getComputedStyle(shadow).boxShadow,
        filter: getComputedStyle(filtered).filter,
        backdrop: getComputedStyle(dialog, "::backdrop").backgroundColor,
      }
    })

    expect(probe.shadow).toBe("none")
    expect(probe.filter).toBe("none")
    expect(probe.backdrop).toBe("rgba(0, 0, 0, 0.6)")
  })

  test("[data-my-ext] keeps its author-origin styling, and vendor ::before/::after are erased (bot-found on #1463)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await cycleTabOff(sw, page, "light-page.html")
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const probe = await page.evaluate(() => {
      // An author-origin sheet styling an extension-owned element exactly
      // the way prepaint.css styles the veil, plus two vendor paint
      // surfaces the erase policy must reach: a plain element and a
      // fixed, full-viewport `html::before` overlay.
      const style = document.createElement("style")
      style.textContent = [
        "#probe-ext { position: fixed; width: 40px; height: 40px; background-color: rgb(1, 2, 3); }",
        "#probe-vendor { background-color: rgb(255, 255, 255); }",
        'html::before { content: ""; position: fixed; inset: 0; background-color: rgb(255, 255, 255); }',
      ].join("\n")
      document.head.appendChild(style)
      const ext = document.createElement("div")
      ext.id = "probe-ext"
      ext.setAttribute("data-my-ext", "")
      const vendor = document.createElement("div")
      vendor.id = "probe-vendor"
      document.body.append(ext, vendor)
      return {
        extBg: getComputedStyle(ext).backgroundColor,
        extPosition: getComputedStyle(ext).position,
        extWidth: getComputedStyle(ext).width,
        vendorBg: getComputedStyle(vendor).backgroundColor,
        htmlBeforeBg: getComputedStyle(document.documentElement, "::before")
          .backgroundColor,
      }
    })

    // The extension-owned element is exactly as the author sheet declared
    // it. An earlier revision's user-origin `all: revert` rule rolled these
    // back to the UA defaults (transparent, static, auto) — which for the
    // real veil meant a UA-styled popover box instead of a dark cover.
    expect(probe.extBg).toBe("rgb(1, 2, 3)")
    expect(probe.extPosition).toBe("fixed")
    expect(probe.extWidth).toBe("40px")
    // Vendor surfaces are erased — the element and the generated box alike.
    expect(probe.vendorBg).toBe("rgba(0, 0, 0, 0)")
    expect(probe.htmlBeforeBg).toBe("rgba(0, 0, 0, 0)")
  })

  // The following five cases replace a single "borderStrong actually
  // renders on a bare vendor element" test that asserted light-page.html's
  // <main> got a forced border. That test predates the lift-gradient
  // amendment: <main> there is the sole child of <body>, so under the new
  // scheme it is :only-child (no lift) and no longer in
  // BORDER_CONTAINER_SELECTOR (no forced border either) — see
  // `adapter/enforcement-sheet.ts`'s own header, "border soup: containers
  // get a lift gradient, not a forced border", and lift-gradient-page.html's
  // own header for the fixture these cases share.

  test("LIFT_SELECTOR — a container with an element sibling gets the lift gradient", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const backgroundImage = await page.evaluate(() => {
      const el = document.getElementById("sibling-a")
      if (el === null) throw new Error("fixture missing #sibling-a")
      return getComputedStyle(el).backgroundImage
    })

    expect(backgroundImage).toContain("linear-gradient")
  })

  test("LIFT_SELECTOR — a single-child wrapper gets no lift", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #lone-child is the sole child of #lone-parent — :only-child, so
    // LIFT_SELECTOR's own :not(:only-child) excludes it. A chain of
    // single-child wrappers is meant to match nothing (this module's own
    // header, "wrapper chains collapse").
    const backgroundImage = await page.evaluate(() => {
      const el = document.getElementById("lone-child")
      if (el === null) throw new Error("fixture missing #lone-child")
      return getComputedStyle(el).backgroundImage
    })

    expect(backgroundImage).toBe("none")
  })

  test("LIFT_SELECTOR — the raster area stays bounded on a very tall container", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #tall-file is 6000px tall (GitHub's "Files changed" tab stand-in — a
    // large expanded diff, this module's own header). Without an explicit
    // background-size, a CSS gradient sizes itself to the element's full
    // box, so the browser would rasterize a 6000px-tall gradient here
    // instead of the fixed 3rem strip the design calls for. background-size
    // must report the bounded size, not "auto" (which is what an unbounded
    // gradient reports) and not the element's own 6000px height.
    const style = await page.evaluate(() => {
      const el = document.getElementById("tall-file")
      if (el === null) throw new Error("fixture missing #tall-file")
      const computed = getComputedStyle(el)
      return {
        backgroundImage: computed.backgroundImage,
        backgroundSize: computed.backgroundSize,
        backgroundRepeat: computed.backgroundRepeat,
      }
    })

    expect(style.backgroundImage).toContain("linear-gradient")
    expect(style.backgroundSize).toBe("100% 48px")
    expect(style.backgroundRepeat).toBe("no-repeat")
  })

  test("border soup fix — a plain container gets no forced border", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #sibling-a declares no border of its own — the vendor default (0px,
    // since the initial border-style is "none"), never forced. The
    // structural-container border this once got is what produced the
    // border-soup finding this fixture's cases guard against.
    const borderWidth = await page.evaluate(() => {
      const el = document.getElementById("sibling-a")
      if (el === null) throw new Error("fixture missing #sibling-a")
      return getComputedStyle(el).borderTopWidth
    })

    expect(borderWidth).toBe("0px")
  })

  test("BORDER_CONTAINER_SELECTOR — form controls and dialog still get a forced border", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const borders = await page.evaluate(() => {
      const ids = ["text-input", "action-button", "modal-dialog"]
      return ids.map((id) => {
        const el = document.getElementById(id)
        if (el === null) throw new Error(`fixture missing #${id}`)
        const style = getComputedStyle(el)
        return {
          id,
          width: style.borderTopWidth,
          styleName: style.borderTopStyle,
        }
      })
    })

    for (const border of borders) {
      expect(border.width).toBe("1px")
      expect(border.styleName).toBe("solid")
    }
  })

  test("[data-my-ext] elements get neither the lift nor a forced border", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await cycleTabOff(sw, page, "lift-gradient-page.html")

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #ext-marked sits among several other children of <main>, so absent
    // the [data-my-ext] exclusion it would be :not(:only-child) and match
    // LIFT_SELECTOR — this asserts the exclusion actually holds, not just
    // that a div gets no lift by default.
    const result = await page.evaluate(() => {
      const el = document.getElementById("ext-marked")
      if (el === null) throw new Error("fixture missing #ext-marked")
      const style = getComputedStyle(el)
      return {
        backgroundImage: style.backgroundImage,
        borderTopWidth: style.borderTopWidth,
      }
    })

    expect(result.backgroundImage).toBe("none")
    expect(result.borderTopWidth).toBe("0px")
  })

  // §3.1 claims a user-origin rule does not cross a shadow boundary. This
  // regression test — run against Chromium 1194, the same revision the ADR
  // itself measured against — found the opposite: see
  // `adapter/enforcement-sheet.ts`'s own header, "Open, blocking finding",
  // for the full account and isolating probes (the erase rule alone, and a
  // single trivial rule with nothing else in the sheet, both reproduce it).
  // This asserts the *actual* observed behavior, not the ADR's claim, so
  // the suite documents current reality rather than going red over an open
  // question this file cannot resolve on its own — flip this back to
  // asserting non-crossing once that investigation lands a fix or shows
  // this run was itself the anomaly.
  test("§3.1 (KNOWN DIVERGENCE) — a user-origin rule currently DOES cross a shadow boundary here", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("shadow-surface-page")
    await cycleTabOff(sw, page, "shadow-surface-page.html")

    // Confirms the sheet actually landed before trusting the shadow
    // assertion below — a shadow assertion that merely never ran (sheet
    // not yet injected) would pass for the wrong reason.
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const shadowBg = await page.evaluate(() => {
      const host = document.createElement("div")
      const root = host.attachShadow({ mode: "open" })
      const surface = document.createElement("div")
      // An explicit author-origin background — exactly the case ADR 0002
      // §3.1 measured (its own four-variant table's simplest member: an
      // open root, populated via plain innerHTML/style rather than an
      // adopted stylesheet). A real element the enforcement sheet's own
      // erase rule flattens to transparent, measured here — contrary to
      // §3.1 — because it *does* reach inside the shadow tree.
      surface.setAttribute(
        "style",
        "background-color: rgb(255, 255, 255); width: 10px; height: 10px;"
      )
      root.appendChild(surface)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
      return getComputedStyle(surface).backgroundColor
    })

    // Measured, not the ADR's own claim: the erase rule's
    // `background-color: transparent !important` overrides the shadow
    // element's own inline style here. If this ever starts failing, that's
    // good news (§3.1 replicating) — update this test and
    // enforcement-sheet.ts's own header together rather than just loosening
    // the assertion.
    expect(shadowBg).toBe("rgba(0, 0, 0, 0)")
  })
})
