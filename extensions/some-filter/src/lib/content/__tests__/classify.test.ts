import { afterEach, describe, expect, it } from "vitest"

import {
  classifyPage,
  effectiveBgLuminance,
  parseColor,
  relativeLuminance,
} from "../classify"

describe("parseColor", () => {
  it("returns null for empty string", () => {
    expect(parseColor("")).toBeNull()
  })

  it("returns null for 'transparent'", () => {
    expect(parseColor("transparent")).toBeNull()
  })

  it("returns null for 'rgba(0, 0, 0, 0)'", () => {
    expect(parseColor("rgba(0, 0, 0, 0)")).toBeNull()
  })

  it("returns null for 'none'", () => {
    expect(parseColor("none")).toBeNull()
  })

  it("parses rgb(255, 255, 255) as opaque white", () => {
    const c = parseColor("rgb(255, 255, 255)")
    expect(c).not.toBeNull()
    expect(c![0]).toBeCloseTo(1)
    expect(c![1]).toBeCloseTo(1)
    expect(c![2]).toBeCloseTo(1)
    expect(c![3]).toBe(1)
  })

  it("parses rgb(0, 0, 0) as opaque black", () => {
    const c = parseColor("rgb(0, 0, 0)")
    expect(c).not.toBeNull()
    expect(c![0]).toBe(0)
    expect(c![1]).toBe(0)
    expect(c![2]).toBe(0)
    expect(c![3]).toBe(1)
  })

  it("parses rgba with explicit alpha", () => {
    const c = parseColor("rgba(255, 128, 64, 0.8)")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(0.8)
  })

  it("returns null for alpha < 0.05", () => {
    expect(parseColor("rgba(255, 255, 255, 0.04)")).toBeNull()
  })

  it("returns non-null for alpha exactly 0.05", () => {
    const c = parseColor("rgba(255, 255, 255, 0.05)")
    expect(c).not.toBeNull()
    expect(c![3]).toBeCloseTo(0.05)
  })
})

describe("relativeLuminance", () => {
  it("returns 1 for white (r=1, g=1, b=1)", () => {
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1)
  })

  it("returns 0 for black (r=0, g=0, b=0)", () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0)
  })

  it("returns ~0.2126 for pure red", () => {
    expect(relativeLuminance(1, 0, 0)).toBeCloseTo(0.2126, 3)
  })

  it("returns ~0.7152 for pure green", () => {
    expect(relativeLuminance(0, 1, 0)).toBeCloseTo(0.7152, 3)
  })

  it("returns ~0.0722 for pure blue", () => {
    expect(relativeLuminance(0, 0, 1)).toBeCloseTo(0.0722, 3)
  })

  it("white luminance is > any other color luminance", () => {
    expect(relativeLuminance(1, 1, 1)).toBeGreaterThan(
      relativeLuminance(0.9, 0.9, 0.9)
    )
  })

  it("luminance is always between 0 and 1", () => {
    const lum = relativeLuminance(0.5, 0.3, 0.7)
    expect(lum).toBeGreaterThanOrEqual(0)
    expect(lum).toBeLessThanOrEqual(1)
  })
})

describe("effectiveBgLuminance", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    document.body.removeAttribute("style")
  })

  it("reads luminance from an ancestor with an explicit background", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    const div = document.createElement("div")
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).not.toBeNull()
    expect(lum!).toBeCloseTo(1)
  })

  it("returns the element's own bg when it has one", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(0, 0, 0)"
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).toBeCloseTo(0)
  })

  it("returns null when no ancestor has an opaque background", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)

    const lum = effectiveBgLuminance(div)
    expect(lum).toBeNull()
  })
})

describe("classifyPage", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style")
    document.body.innerHTML = ""
  })

  it("returns isLight=true with skip=false when there are zero opaque samples (fallback)", () => {
    // Default jsdom DOM has no explicit bg on html/body — zero samples collected.
    // classifyPage biases toward applying the dark theme on ambiguous pages.
    const result = classifyPage()
    expect(result.avgLuminance).toBeNull()
    expect(result.isLight).toBe(true)
    expect(result.skip).toBe(false)
  })

  it("returns isLight=true when body has an explicit white background", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"

    const result = classifyPage()
    expect(result.isLight).toBe(true)
    expect(result.skip).toBe(false)
    expect(result.avgLuminance).not.toBeNull()
    expect(result.avgLuminance!).toBeGreaterThan(0.4)
  })

  it("returns isLight=false when body has an explicit dark background", () => {
    document.body.style.backgroundColor = "rgb(20, 20, 20)"

    const result = classifyPage()
    expect(result.isLight).toBe(false)
  })

  it("skip=true when html and body both carry the prepaint dark color (simulates un-suppressed prepaint)", () => {
    // Root cause of Bug 1: when findPrepaintSheet() fails (SecurityError on
    // cssRules access swallowed silently), the prepaint sheet stays active.
    // html and body get background-color: #0d1117 from prepaint.css.
    // classifyPage() samples these as luminance ≈ 0.005, avgLuminance ≈ 0.005.
    // isLight = 0.005 > 0.4 → false.  skip = 0.005 < 0.2 → true.
    // Result: no dark theme applied, veil drops, white page exposed.
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"

    const result = classifyPage()
    expect(result.isLight).toBe(false)
    expect(result.skip).toBe(true)
  })

  it("excludes extension-owned nodes from Tier 2 sampling", () => {
    const main = document.createElement("main")
    main.setAttribute("data-my-ext", "")
    main.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(main)

    // Extension node excluded → zero samples → fallback to isLight=true
    const result = classifyPage()
    expect(result.avgLuminance).toBeNull()
    expect(result.isLight).toBe(true)
  })

  it("samples Tier 2 semantic containers when present", () => {
    const main = document.createElement("main")
    main.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(main)

    const result = classifyPage()
    expect(result.isLight).toBe(true)
    expect(result.avgLuminance).not.toBeNull()
  })

  it("respects a custom threshold", () => {
    // luminance ≈ 0.35 (between default 0.4 and a lower threshold of 0.3)
    // rgb(161, 161, 161) → lum ≈ 0.37
    document.body.style.backgroundColor = "rgb(161, 161, 161)"

    const atDefault = classifyPage(0.4)
    expect(atDefault.isLight).toBe(false) // 0.37 < 0.4

    const atLower = classifyPage(0.3)
    expect(atLower.isLight).toBe(true) // 0.37 > 0.3
  })
})
