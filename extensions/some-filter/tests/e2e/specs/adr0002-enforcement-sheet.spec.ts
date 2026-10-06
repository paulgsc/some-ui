/**
 * ADR 0002 §7 step 2 — enforcement sheet e2e.
 *
 * Tests §3.2 and §3.1, the ADR's acceptance bar for this step. Neither is
 * checkable from a unit test: both are about the real cascade, and §3.1 is
 * about a live `insertCSS({ origin: "USER" })` from a real MV3 service worker
 * reaching a real shadow boundary.
 *
 * Every test waits for the tab to report the sheet confirmed
 * (`data-sw-theme-applied="enforced"`) and asserts the classifier never ran
 * (`data-sw-dark` absent). With the flag on, auto mode is the sheet alone, so
 * what these tests read is attributable to the sheet.
 */

import { expect, test } from "@filter/playwright/fixture"
import type { Page, Worker } from "@playwright/test"

/** Chromium's MV3 background service worker — mirrors legacy-mode.ts's own helper (not imported from there: that module also carries LEGACY_CONFIG/enterLegacyMode, unrelated to this file). */
async function backgroundWorker(context: {
  serviceWorkers(): ReadonlyArray<Worker>
  waitForEvent(event: "serviceworker"): Promise<Worker>
}): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  const sw = existing ?? (await context.waitForEvent("serviceworker"))
  // Each test calls this before any page loads, so the worker can be handed
  // back before its global scope is set up (`chrome.storage` and even
  // `setTimeout` undefined, about 1 run in 100 under --repeat-each). A poll
  // inside the worker cannot wait on that, so it polls from here.
  for (let attempt = 0; attempt < 250; attempt++) {
    const bound = await sw.evaluate(() => {
      // Partial: the typings declare every namespace present, which is the
      // assumption this wait exists to check.
      const scope: { chrome?: Partial<typeof chrome> } = globalThis
      return scope.chrome?.storage !== undefined
    })
    if (bound) return sw
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("chrome.storage never bound in the service worker")
}

/**
 * Flips the flag (no UI toggle exists yet; see `background.ts`). Must run
 * before `fixture.goto()`: the content script reads it when auto starts.
 */
async function enableEnforcementSheet(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    // Raw chrome.* — this runs inside the real service worker via CDP, not
    // through this repo's module graph.
    // eslint-disable-next-line no-restricted-globals
    await chrome.storage.local.set({ enforcementSheetEnabled: true })
  })
}

/**
 * Waits for the content script's confirm read (the sheet read back from the
 * cascade) and checks the classifier stayed off: it must never start in the
 * same tab as the sheet.
 */
async function awaitEnforced(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.body.dataset["swThemeApplied"] === "enforced",
    undefined,
    { timeout: 5_000, polling: 100 }
  )
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-sw-dark")
    )
  ).toBe(false)
}

// SWATCHES.default's bg0 (#171c25), as a literal: the worker's raw
// evaluate() context does not run inside this repo's module graph.
const ENFORCED_BG = "rgb(23, 28, 37)"
// SWATCHES.default.borderStrong, a literal for the same reason.
const BORDER_STRONG = "rgba(255, 255, 255, 0.35)"

test.describe("ADR 0002 enforcement sheet", () => {
  test("§3.2 — the canvas rule wins the specificity trap (html/body never blank)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)

    // Polls: insertCSS is an async round trip through the service worker,
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

    // An unboosted `html, body` rule loses to the erase rule and reads back
    // transparent, leaving the UA's white default (ADR 0002 §3.2). Asserting
    // the *specific* colour catches that and a `transparent` no-op alike.
    expect(htmlBg).toBe(ENFORCED_BG)
    expect(bodyBg).toBe(ENFORCED_BG)
  })

  test("a vendor root filter does not invert E back to light", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    // light-page.html plus `html { filter: invert(1) }`. A compositing
    // filter applies after painting, so un-neutralized it would render bg0
    // as its inverse.
    const page = await fixture.goto("filter-invert-vendor-page")
    await awaitEnforced(page)
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

  test("inset-shadow fills, descendant filters and a white dialog backdrop are all neutralized", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
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
        "#probe-dialog::backdrop { background-color: rgb(255, 255, 255); box-shadow: inset 0 0 0 9999px rgb(255, 255, 255); backdrop-filter: invert(1); }",
        "#probe-overlay { position: fixed; inset: 0; backdrop-filter: invert(1); }",
        "#probe-glyph { text-shadow: 0 0 0 rgb(255, 255, 255); outline: 2px dashed rgb(255, 255, 255); }",
      ].join("\n")
      document.head.appendChild(style)
      const glyph = document.createElement("p")
      glyph.id = "probe-glyph"
      glyph.textContent = "probe"
      const shadow = document.createElement("div")
      shadow.id = "probe-shadow"
      const filtered = document.createElement("main")
      filtered.id = "probe-filter"
      const dialog = document.createElement("dialog")
      dialog.id = "probe-dialog"
      const overlay = document.createElement("div")
      overlay.id = "probe-overlay"
      document.body.append(glyph, shadow, filtered, dialog, overlay)
      dialog.showModal()
      const backdrop = getComputedStyle(dialog, "::backdrop")
      const glyphStyle = getComputedStyle(glyph)
      return {
        textShadow: glyphStyle.textShadow,
        outlineColor: glyphStyle.outlineColor,
        outlineWidth: glyphStyle.outlineWidth,
        outlineStyle: glyphStyle.outlineStyle,
        shadow: getComputedStyle(shadow).boxShadow,
        filter: getComputedStyle(filtered).filter,
        overlayBackdropFilter: getComputedStyle(overlay).backdropFilter,
        backdrop: backdrop.backgroundColor,
        backdropShadow: backdrop.boxShadow,
        backdropFilter: backdrop.backdropFilter,
      }
    })

    // Glyph and edge channels: the shadow is gone; the outline keeps its
    // vendor width/style but takes borderStrong's colour (a literal, as
    // ENFORCED_BG).
    expect(probe.textShadow).toBe("none")
    expect(probe.outlineColor).toBe(BORDER_STRONG)
    expect(probe.outlineWidth).toBe("2px")
    expect(probe.outlineStyle).toBe("dashed")
    expect(probe.shadow).toBe("none")
    expect(probe.filter).toBe("none")
    expect(probe.overlayBackdropFilter).toBe("none")
    expect(probe.backdrop).toBe("rgba(0, 0, 0, 0.6)")
    expect(probe.backdropShadow).toBe("none")
    expect(probe.backdropFilter).toBe("none")
  })

  test("an authored ::placeholder colour is overridden by the highlight table", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const placeholder = await page.evaluate(() => {
      const style = document.createElement("style")
      style.textContent = "#probe-input::placeholder { color: rgb(255, 0, 0); }"
      document.head.appendChild(style)
      const input = document.createElement("input")
      input.id = "probe-input"
      input.placeholder = "probe"
      document.body.append(input)
      return getComputedStyle(input, "::placeholder").color
    })

    // SWATCHES.default.text2, as a literal for the same reason ENFORCED_BG is.
    expect(placeholder).toBe("rgb(71, 85, 105)")
  })

  test("[data-my-ext] keeps its author-origin styling, and vendor ::before/::after are erased", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const probe = await page.evaluate(() => {
      // An author-origin sheet styling an extension-owned element the way
      // prepaint.css styles the veil, plus two vendor paint surfaces the
      // erase policy must reach: a plain element and a fixed `html::before`.
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
    // it; a user-origin `all: revert` would roll it back to UA defaults.
    expect(probe.extBg).toBe("rgb(1, 2, 3)")
    expect(probe.extPosition).toBe("fixed")
    expect(probe.extWidth).toBe("40px")
    // Vendor surfaces are erased — the element and the generated box alike.
    expect(probe.vendorBg).toBe("rgba(0, 0, 0, 0)")
    expect(probe.htmlBeforeBg).toBe("rgba(0, 0, 0, 0)")
  })

  test("glyph fill, underline colour, typographic pseudo-elements and nested extension UI (#1497)", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    const probe = await page.evaluate(() => {
      const style = document.createElement("style")
      style.textContent = [
        "#probe-fill { -webkit-text-fill-color: rgb(17, 17, 17); }",
        "#probe-link { text-decoration: underline; text-decoration-color: rgb(255, 255, 255); }",
        "#probe-list li::marker { color: rgb(255, 255, 255); }",
        "#probe-para::first-line { background-color: rgb(255, 255, 255); color: rgb(255, 255, 255); }",
        "#probe-para::first-letter { background-color: rgb(255, 255, 255); }",
        "#probe-file::file-selector-button { background-color: rgb(255, 255, 255); }",
        "#probe-ext-child { background-color: rgb(1, 2, 3); color: rgb(4, 5, 6); }",
      ].join("\n")
      document.head.appendChild(style)
      const fill = document.createElement("div")
      fill.id = "probe-fill"
      fill.textContent = "fill"
      const link = document.createElement("a")
      link.id = "probe-link"
      link.href = "#never-visited-1497"
      link.textContent = "link"
      const list = document.createElement("ul")
      list.id = "probe-list"
      const item = document.createElement("li")
      item.textContent = "item"
      list.append(item)
      const para = document.createElement("p")
      para.id = "probe-para"
      para.textContent = "paragraph"
      const file = document.createElement("input")
      file.id = "probe-file"
      file.type = "file"
      const ext = document.createElement("div")
      ext.setAttribute("data-my-ext", "")
      const extChild = document.createElement("div")
      extChild.id = "probe-ext-child"
      extChild.textContent = "nested extension UI"
      ext.append(extChild)
      document.body.append(fill, link, list, para, file, ext)
      const cs = (el: Element, pseudo?: string): CSSStyleDeclaration =>
        getComputedStyle(el, pseudo)
      return {
        fillColor: cs(fill).color,
        fillText: cs(fill).webkitTextFillColor,
        linkColor: cs(link).color,
        linkDecoration: cs(link).textDecorationColor,
        itemColor: cs(item).color,
        marker: cs(item, "::marker").color,
        paraColor: cs(para).color,
        firstLineBg: cs(para, "::first-line").backgroundColor,
        firstLineColor: cs(para, "::first-line").color,
        firstLetterBg: cs(para, "::first-letter").backgroundColor,
        fileButtonBg: cs(file, "::file-selector-button").backgroundColor,
        extChildBg: cs(extChild).backgroundColor,
        extChildColor: cs(extChild).color,
        extChildFill: cs(extChild).webkitTextFillColor,
      }
    })

    // SWATCHES.default tokens, as literals for the same reason ENFORCED_BG is.
    const TEXT0 = "rgb(134, 153, 177)"
    const TEXT1 = "rgb(148, 163, 184)"
    const LINK = "rgb(122, 162, 247)"
    // Glyph fill and underline follow the element's enforced colour — the
    // erase rule's text0 on a div, the highlight table's link on an <a>.
    expect(probe.fillColor).toBe(TEXT0)
    expect(probe.fillText).toBe(TEXT0)
    expect(probe.linkColor).toBe(LINK)
    expect(probe.linkDecoration).toBe(LINK)
    // Typographic pseudo-elements inherit the originating element's tier
    // (li and p are text1 rows), and their boxes are erased.
    expect(probe.itemColor).toBe(TEXT1)
    expect(probe.marker).toBe(TEXT1)
    expect(probe.paraColor).toBe(TEXT1)
    expect(probe.firstLineColor).toBe(TEXT1)
    expect(probe.firstLineBg).toBe("rgba(0, 0, 0, 0)")
    expect(probe.firstLetterBg).toBe("rgba(0, 0, 0, 0)")
    // Painted like every other button: SWATCHES.default.inputBg.
    expect(probe.fileButtonBg).toBe("rgb(33, 38, 49)")
    // A descendant of an extension-owned element keeps its author styling.
    expect(probe.extChildBg).toBe("rgb(1, 2, 3)")
    expect(probe.extChildColor).toBe("rgb(4, 5, 6)")
    // -webkit-text-fill-color inherits: the glyphs must follow the subtree's
    // own colour, not the enforced one from an ancestor outside the guard.
    expect(probe.extChildFill).toBe("rgb(4, 5, 6)")
  })

  // Shared fixture: lift-gradient-page.html (see its header and
  // enforcement-sheet.ts's lift section).

  test("LIFT_SELECTOR — a container with an element sibling gets the lift gradient", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("lift-gradient-page")
    await awaitEnforced(page)

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
    await awaitEnforced(page)

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #lone-child is :only-child, so LIFT_SELECTOR excludes it: wrapper
    // chains collapse.
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
    await awaitEnforced(page)

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #tall-file is 6000px tall. background-size must report the bounded
    // strip, not "auto" (an unbounded gradient) or the element's height.
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
    await awaitEnforced(page)

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #sibling-a declares no border: the vendor default (0px), never forced.
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
    await awaitEnforced(page)

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
    await awaitEnforced(page)

    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor === expected,
      ENFORCED_BG,
      { timeout: 5_000, polling: 100 }
    )

    // #ext-marked has siblings, so without the [data-my-ext] exclusion it
    // would match LIFT_SELECTOR.
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

  // §3.1 claims a user-origin rule does not cross a shadow boundary; on
  // Chromium 1194 it does (see enforcement-sheet.ts's header, "Shadow
  // crossing"). This asserts observed behaviour, so the suite documents
  // reality; ADR 0003 keeps it as a permanent canary.
  test("§3.1 (KNOWN DIVERGENCE) — a user-origin rule currently DOES cross a shadow boundary here", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcementSheet(sw)

    const page = await fixture.goto("shadow-surface-page")
    await awaitEnforced(page)

    // Confirms the sheet landed first, so the shadow assertion cannot pass
    // for the wrong reason.
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
      // An explicit author-origin background in an open root — the simplest
      // case ADR 0002 §3.1 measured.
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

    // Measured: the erase rule overrides the shadow element's inline style.
    // If this starts failing, update this test and enforcement-sheet.ts's
    // header together rather than loosening the assertion.
    expect(shadowBg).toBe("rgba(0, 0, 0, 0)")
  })
})
