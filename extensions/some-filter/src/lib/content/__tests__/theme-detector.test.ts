import { afterEach, describe, expect, it } from "vitest"

import { classifyPage, detect } from "../theme-detector"

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

describe("detect", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style")
    document.body.innerHTML = ""
  })

  it("delegates to classifyPage (same result for the same DOM)", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    expect(detect()).toEqual(classifyPage())
  })

  it("forwards a custom threshold", () => {
    document.body.style.backgroundColor = "rgb(161, 161, 161)"
    expect(detect(0.3).isLight).toBe(true)
    expect(detect(0.4).isLight).toBe(false)
  })

  it("does not mutate the DOM (read-only)", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    const before = document.body.innerHTML
    detect()

    expect(document.body.innerHTML).toBe(before)
    expect(div.dataset.swPatched).toBeUndefined()
    expect(document.documentElement.hasAttribute("data-sw-dark")).toBe(false)
  })
})
