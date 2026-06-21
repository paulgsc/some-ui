import { afterEach, describe, expect, it } from "vitest"

import {
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
  repatchPage,
} from "../dark-theme"

const STYLE_ID = "__sw_dark_theme"

afterEach(() => {
  removeDarkTheme()
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
    // rgb(140, 140, 140) → lin(0.549) ≈ 0.254 → lum ≈ 0.254 ... let's find the right value
    // We need lum in (0.3, 0.5].
    // rgb(170, 170, 170) → c = 170/255 ≈ 0.667
    // lin(0.667) = ((0.667 + 0.055) / 1.055)^2.4 = (0.684)^2.4 ≈ 0.415
    // lum ≈ 0.415 → in (0.3, 0.5]  → 'bg-2'
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(170, 170, 170)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("bg-2")
  })

  it("tags near-black elements as 'preserve' (lum < 0.06)", () => {
    // rgb(30, 30, 30) → c = 30/255 ≈ 0.118
    // lin(0.118) = 0.118 / 12.92 ≈ 0.00913  (≤ 0.03928, so linear branch)
    // lum ≈ 0.00913 → < 0.06 → 'preserve'
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
