import { afterEach, describe, expect, it } from "vitest"

import {
  applyTheme,
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
  repatchPage,
  restoreVendor,
} from "../theme-apply"

const STYLE_ID = "__sw_dark_theme"
const LEGACY_STYLE_ID = "__sw_legacy_filter"

afterEach(() => {
  restoreVendor()
})

describe("DARK_THEME_ATTR", () => {
  it("is the expected attribute name", () => {
    expect(DARK_THEME_ATTR).toBe("data-sw-dark")
  })
})

describe("injectDarkTheme", () => {
  it("appends a <style id='__sw_dark_theme'> to document.head", () => {
    injectDarkTheme()
    const style = document.getElementById(STYLE_ID)
    expect(style).not.toBeNull()
    expect(style?.tagName).toBe("STYLE")
    expect(document.head.contains(style)).toBe(true)
  })

  it("is idempotent — a second call reuses the same element", () => {
    injectDarkTheme()
    injectDarkTheme()
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1)
  })

  it("patches an element with a white background as 'surface' (lum > 0.7)", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("surface")
  })

  it("patches a light-grey element as 'bg-1' (0.5 < lum <= 0.7)", () => {
    // rgb(200, 200, 200) → lin(0.784) ≈ 0.576 → lum ≈ 0.576
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(200, 200, 200)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("bg-1")
  })

  it("patches a mid-grey element as 'bg-2' (0.3 < lum <= 0.5)", () => {
    // rgb(170, 170, 170) → lum ≈ 0.415 → in (0.3, 0.5]  → 'bg-2'
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(170, 170, 170)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("bg-2")
  })

  it("tags near-black elements as 'preserve' (lum < 0.06)", () => {
    // rgb(30, 30, 30) → lum ≈ 0.00913 → < 0.06 → 'preserve'
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(30, 30, 30)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("preserve")
  })

  it("does not patch elements with near-transparent backgrounds (alpha < 0.1)", () => {
    // alpha = 0.08: parseColor passes (> 0.05), classifyElement guards (< 0.1)
    const div = document.createElement("div")
    div.style.backgroundColor = "rgba(255, 255, 255, 0.08)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBeUndefined()
  })

  it("does not patch elements owned by the extension (data-my-ext)", () => {
    const div = document.createElement("div")
    div.setAttribute("data-my-ext", "")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBeUndefined()
  })

  it("does not patch descendants of extension-owned nodes", () => {
    const parent = document.createElement("div")
    parent.setAttribute("data-my-ext", "")
    const child = document.createElement("div")
    child.style.backgroundColor = "rgb(255, 255, 255)"
    parent.appendChild(child)
    document.body.appendChild(parent)

    injectDarkTheme()

    expect(child.dataset.swPatched).toBeUndefined()
  })

  it("skips SCRIPT and STYLE tags", () => {
    const style = document.createElement("style")
    style.textContent = "body { color: red }"
    document.head.appendChild(style)

    injectDarkTheme()

    expect(style.dataset.swPatched).toBeUndefined()
  })

  it("skips IMG and VIDEO tags", () => {
    const img = document.createElement("img")
    const video = document.createElement("video")
    document.body.append(img, video)

    injectDarkTheme()

    expect(img.dataset.swPatched).toBeUndefined()
    expect(video.dataset.swPatched).toBeUndefined()
  })
})

describe("removeDarkTheme", () => {
  it("removes the __sw_dark_theme style element", () => {
    injectDarkTheme()
    expect(document.getElementById(STYLE_ID)).not.toBeNull()

    removeDarkTheme()

    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it("clears all data-sw-patched attributes", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)
    injectDarkTheme()
    expect(div.dataset.swPatched).toBeDefined()

    removeDarkTheme()

    expect(div.dataset.swPatched).toBeUndefined()
    expect(document.querySelectorAll("[data-sw-patched]")).toHaveLength(0)
  })

  it("is safe to call when no theme has been injected", () => {
    expect(() => removeDarkTheme()).not.toThrow()
  })
})

describe("repatchPage", () => {
  it("classifies elements that gained a background after initial injection", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    injectDarkTheme()
    expect(div.dataset.swPatched).toBeUndefined() // no bg yet

    div.style.backgroundColor = "rgb(255, 255, 255)"
    repatchPage()

    expect(div.dataset.swPatched).toBe("surface")
  })

  it("re-classifies an element whose background changed", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(200, 200, 200)" // bg-1
    document.body.appendChild(div)
    injectDarkTheme()
    expect(div.dataset.swPatched).toBe("bg-1")

    div.style.backgroundColor = "rgb(255, 255, 255)" // now surface
    repatchPage()

    expect(div.dataset.swPatched).toBe("surface")
  })
})

describe("applyTheme", () => {
  it("'dark' sets the dark attribute and injects the theme style", () => {
    applyTheme("dark")
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
  })

  it("'legacy' installs the global filter style with the configured values", () => {
    applyTheme("legacy", { invert: 1, hueRotate: 180 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain("invert(1)")
    expect(style?.textContent).toContain("hue-rotate(180deg)")
  })

  it("'legacy' does not touch the dark-theme attribute or style", () => {
    applyTheme("legacy", { invert: 1 })
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
  })
})

describe("restoreVendor", () => {
  it("removes dark theme (attr + style + patched attrs)", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)
    applyTheme("dark")

    restoreVendor()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.querySelectorAll("[data-sw-patched]")).toHaveLength(0)
  })

  it("removes the legacy filter style", () => {
    applyTheme("legacy", { invert: 1 })
    expect(document.getElementById(LEGACY_STYLE_ID)).not.toBeNull()

    restoreVendor()

    expect(document.getElementById(LEGACY_STYLE_ID)).toBeNull()
  })

  it("is safe to call when nothing is applied", () => {
    expect(() => restoreVendor()).not.toThrow()
  })
})
