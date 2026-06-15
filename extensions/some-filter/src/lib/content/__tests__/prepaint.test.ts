import { afterEach, describe, expect, it } from "vitest"

import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  PREPAINT_ATTR,
  withPrepaintSuppressed,
} from "../prepaint"

// Must match browser.runtime.getURL mock in vitest.setup.ts
const PREPAINT_HREF = "chrome-extension://testextensionid/prepaint.css"

/**
 * jsdom does not create a CSSStyleSheet for <link rel="stylesheet"> elements
 * (no resource fetching). Instead we inject a <style> element and override its
 * href via Object.defineProperty so findPrepaintSheet()'s URL comparison works.
 */
function injectMockPrepaintSheet(): CSSStyleSheet {
  const style = document.createElement("style")
  document.head.appendChild(style)
  // Non-null: we just appended a style element so the sheet exists.

  const sheet = document.styleSheets[document.styleSheets.length - 1]!
  Object.defineProperty(sheet, "href", {
    configurable: true,
    get: () => PREPAINT_HREF,
  })
  return sheet
}

describe("enablePrepaint / disablePrepaint", () => {
  it("enablePrepaint sets the data-sw-prepaint attribute on html", () => {
    enablePrepaint()
    expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(true)
  })

  it("disablePrepaint removes the data-sw-prepaint attribute from html", () => {
    document.documentElement.setAttribute(PREPAINT_ATTR, "")
    disablePrepaint()
    expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
  })

  it("disablePrepaint is a no-op when the attribute is already absent", () => {
    expect(() => disablePrepaint()).not.toThrow()
    expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
  })
})

describe("commitVisualState", () => {
  it("removes data-sw-prepaint after two rAFs", () => {
    document.documentElement.setAttribute(PREPAINT_ATTR, "")
    commitVisualState()
    // vitest.setup.ts stubs rAF to execute synchronously,
    // so both nested rAFs fire immediately.
    expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
  })
})

describe("withPrepaintSuppressed", () => {
  afterEach(() => {
    document.head.querySelectorAll("style").forEach((el) => el.remove())
  })

  it("returns the value produced by fn", () => {
    expect(withPrepaintSuppressed(() => 42)).toBe(42)
  })

  it("returns the object produced by fn (referential equality)", () => {
    const obj = { isLight: true }
    expect(withPrepaintSuppressed(() => obj)).toBe(obj)
  })

  it("injects a transition-freeze style while fn runs", () => {
    let styleCountDuringFn = 0
    withPrepaintSuppressed(() => {
      styleCountDuringFn = document.head.querySelectorAll("style").length
    })
    expect(styleCountDuringFn).toBe(1)
  })

  it("removes the transition-freeze style after fn returns", () => {
    withPrepaintSuppressed(() => {})
    expect(document.head.querySelectorAll("style")).toHaveLength(0)
  })

  it("removes the freeze style even when fn throws", () => {
    try {
      withPrepaintSuppressed(() => {
        throw new Error("boom")
      })
    } catch {
      // expected
    }
    expect(document.head.querySelectorAll("style")).toHaveLength(0)
  })

  it("propagates exceptions from fn", () => {
    expect(() =>
      withPrepaintSuppressed(() => {
        throw new Error("test error")
      })
    ).toThrow("test error")
  })

  it("still calls fn when no prepaint sheet is found", () => {
    let called = false
    withPrepaintSuppressed(() => {
      called = true
    })
    expect(called).toBe(true)
  })

  describe("when the prepaint sheet is present", () => {
    it("disables the sheet before fn runs", () => {
      const sheet = injectMockPrepaintSheet()

      let disabledDuringFn = false
      withPrepaintSuppressed(() => {
        disabledDuringFn = sheet.disabled
      })

      expect(disabledDuringFn).toBe(true)
    })

    it("keeps the sheet permanently disabled after fn returns", () => {
      // Re-enabling the sheet after classification would allow the
      // patchObserver to see SPA nodes under prepaint's `transparent
      // !important` rules, sample near-zero luminance, and permanently
      // tag them `preserve` — exposing white backgrounds after veil drop.
      const sheet = injectMockPrepaintSheet()

      withPrepaintSuppressed(() => {})

      expect(sheet.disabled).toBe(true)
    })

    it("keeps the sheet disabled even when fn throws", () => {
      const sheet = injectMockPrepaintSheet()

      try {
        withPrepaintSuppressed(() => {
          throw new Error()
        })
      } catch {
        // expected
      }

      expect(sheet.disabled).toBe(true)
    })

    it("does not disable a sheet at a different href", () => {
      // Inject an unrelated page stylesheet first.
      const otherStyle = document.createElement("style")
      otherStyle.textContent = "body { margin: 0 }"
      document.head.appendChild(otherStyle)

      const otherSheet = document.styleSheets[0]!
      // Leave otherSheet.href as-is (null/undefined) — it won't match prepaint URL.

      // Inject the prepaint mock second.
      const prepaintSheet = injectMockPrepaintSheet()

      withPrepaintSuppressed(() => {})

      expect(prepaintSheet.disabled).toBe(true)
      expect(otherSheet.disabled).not.toBe(true) // not touched by withPrepaintSuppressed
    })
  })
})
