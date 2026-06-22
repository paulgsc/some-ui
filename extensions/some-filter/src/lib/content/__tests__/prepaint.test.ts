import { afterEach, describe, expect, it } from "vitest"

import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  PREPAINT_VEIL_ID,
  withPrepaintSuppressed,
} from "../prepaint"

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  document.documentElement.classList.remove("sw-dirty")
  document.head.querySelectorAll("style").forEach((el) => el.remove())
})

describe("enablePrepaint", () => {
  it("creates the overlay veil element", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil).not.toBeNull()
    expect(veil?.tagName).toBe("DIV")
  })

  it("marks the veil [data-my-ext] so the detector/patcher skip it", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil?.hasAttribute("data-my-ext")).toBe(true)
  })

  it("is idempotent — a second call does not create a duplicate", () => {
    enablePrepaint()
    enablePrepaint()
    expect(document.querySelectorAll(`#${PREPAINT_VEIL_ID}`)).toHaveLength(1)
  })

  it("anchors the veil to documentElement so body mutations cannot remove it", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil?.parentElement).toBe(document.documentElement)
  })

  it("adds sw-dirty class to html to activate the CSS backstop", () => {
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
  })

  it("sw-dirty is added even when a veil element already exists", () => {
    document.documentElement.classList.remove("sw-dirty")
    enablePrepaint() // creates veil
    disablePrepaint() // removes both class and veil
    // Simulate a re-enable (e.g. SPA navigation)
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
  })
})

describe("disablePrepaint", () => {
  it("removes the overlay veil", () => {
    enablePrepaint()
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()

    disablePrepaint()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("removes sw-dirty class from html", () => {
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)

    disablePrepaint()

    expect(document.documentElement.classList.contains("sw-dirty")).toBe(false)
  })

  it("is a no-op when no veil exists", () => {
    expect(() => disablePrepaint()).not.toThrow()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("removes sw-dirty even when no veil element is present", () => {
    document.documentElement.classList.add("sw-dirty")
    disablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(false)
  })
})

describe("commitVisualState", () => {
  it("removes the veil after two rAFs", () => {
    enablePrepaint()
    commitVisualState()
    // vitest.setup.ts stubs rAF to execute synchronously,
    // so both nested rAFs fire immediately.
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })
})

describe("withPrepaintSuppressed", () => {
  it("returns the value produced by fn", () => {
    expect(withPrepaintSuppressed(() => 42)).toBe(42)
  })

  it("returns the object produced by fn (referential equality)", () => {
    const obj = { alreadyDark: true }
    expect(withPrepaintSuppressed(() => obj)).toBe(obj)
  })

  it("injects a transition-freeze style while fn runs", () => {
    let styleCountDuringFn = 0
    withPrepaintSuppressed(() => {
      styleCountDuringFn = document.head.querySelectorAll("style").length
    })
    expect(styleCountDuringFn).toBe(1)
  })

  it("the freeze style is marked [data-my-ext]", () => {
    let marked = false
    withPrepaintSuppressed(() => {
      const style = document.head.querySelector("style")
      marked = style?.hasAttribute("data-my-ext") ?? false
    })
    expect(marked).toBe(true)
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

  it("does not touch the veil — vendor styles are read with the veil up", () => {
    enablePrepaint()
    let veilPresentDuringFn = false
    withPrepaintSuppressed(() => {
      veilPresentDuringFn = document.getElementById(PREPAINT_VEIL_ID) !== null
    })
    expect(veilPresentDuringFn).toBe(true)
    // and it is still present after — teardown is the caller's job
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
  })
})
