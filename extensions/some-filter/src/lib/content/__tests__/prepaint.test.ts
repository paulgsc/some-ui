import { afterEach, describe, expect, it } from "vitest"

import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  PREPAINT_ATTR,
  withPrepaintSuppressed,
} from "../prepaint"

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

  it("always calls fn — there is no sheet-lookup failure mode anymore", () => {
    let called = false
    withPrepaintSuppressed(() => {
      called = true
    })
    expect(called).toBe(true)
  })

  describe("attribute-based suppression (replaces deleted sheet-object strategy)", () => {
    // Root cause: document.styleSheets never enumerated the manifest-injected
    // prepaint.css sheet under Chrome MV3 content-script CSS injection — a
    // 60-frame polling probe against a real browser showed it flat at 0
    // indefinitely, even though the CSS rules demonstrably applied (a
    // cascade sentinel custom property went live within one animation
    // frame). Suppression now operates purely on the data-sw-prepaint
    // attribute, which prepaint.css's selectors are entirely gated on.
    // These tests cover the same invariants the old sheet.disabled tests
    // covered, expressed against the attribute instead.

    it("removes the prepaint attribute before fn runs", () => {
      document.documentElement.setAttribute(PREPAINT_ATTR, "")

      let attrPresentDuringFn = true

      withPrepaintSuppressed(() => {
        attrPresentDuringFn =
          document.documentElement.hasAttribute(PREPAINT_ATTR)
      })

      expect(attrPresentDuringFn).toBe(false)
    })

    it("keeps the attribute permanently removed after fn returns", () => {
      // Re-adding the attribute after classification would allow the
      // patchObserver to see SPA nodes under prepaint's `transparent
      // !important` rules, sample near-zero luminance, and permanently
      // tag them `preserve` — exposing white backgrounds after veil drop.
      document.documentElement.setAttribute(PREPAINT_ATTR, "")

      withPrepaintSuppressed(() => {})

      expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
    })

    it("keeps the attribute removed even when fn throws", () => {
      document.documentElement.setAttribute(PREPAINT_ATTR, "")

      try {
        withPrepaintSuppressed(() => {
          throw new Error()
        })
      } catch {
        // expected
      }

      expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
    })

    it("is a no-op (not an error) when the attribute was never present", () => {
      document.documentElement.removeAttribute(PREPAINT_ATTR)

      expect(() => withPrepaintSuppressed(() => {})).not.toThrow()
      expect(document.documentElement.hasAttribute(PREPAINT_ATTR)).toBe(false)
    })
  })
})
