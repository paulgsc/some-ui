import { afterEach, describe, expect, it } from "vitest"

import { parseColor, relativeLuminance } from "../color"
import {
  applyTheme,
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
  repatchPage,
  restoreVendor,
} from "../theme-apply"

const STYLE_ID = "__sw_dark_theme"
const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"
const LEGACY_STYLE_ID = "__sw_legacy_filter"

afterEach(() => {
  restoreVendor()
})

/** Read the generated background-color a patcher token maps to, or null. */
function colorForToken(token: string): string | null {
  const text = document.getElementById(DYNAMIC_STYLE_ID)?.textContent ?? ""
  const m = text.match(
    new RegExp(
      `\\[data-sw-patched="${token}"\\][^{]*\\{background-color:([^!]+)!important`
    )
  )
  return m?.[1]?.trim() ?? null
}

function luminanceForToken(token: string): number {
  const css = colorForToken(token)
  expect(css).not.toBeNull()

  if (typeof css !== "string") {
    throw new Error("CSS color string not found")
  }

  const c = parseColor(css)
  expect(c).not.toBeNull()

  if (!c) {
    throw new Error("Failed to parse color")
  }

  return relativeLuminance(c[0], c[1], c[2])
}

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

  it("tags a light background with a token mapped to a dark, hue-preserving color", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    injectDarkTheme()

    const token = div.dataset.swPatched
    expect(token).toMatch(/^c\d+$/)

    if (typeof token === "string") {
      expect(luminanceForToken(token)).toBeLessThan(0.3)
    }
  })

  it("preserves hue when darkening a colored surface", () => {
    // A light-blue panel should become a dark *blue* surface, not grey.
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(200, 220, 255)" // light blue
    document.body.appendChild(div)

    injectDarkTheme()

    const token = div.dataset.swPatched
    if (typeof token === "string") {
      const css = colorForToken(token)
      if (typeof css === "string") {
        const c = parseColor(css)
        expect(c).not.toBeNull()
        if (c) {
          // blue channel dominant → hue preserved
          expect(c[2]).toBeGreaterThan(c[0])
          expect(c[2]).toBeGreaterThan(c[1])
        }
      }
    }
  })

  it("uses one token for repeated identical backgrounds", () => {
    const a = document.createElement("div")
    const b = document.createElement("div")
    a.style.backgroundColor = "rgb(255, 255, 255)"
    b.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.append(a, b)

    injectDarkTheme()

    expect(a.dataset.swPatched).toBe(b.dataset.swPatched)
  })

  it("tags near-black elements as 'preserve' (lum < 0.06)", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(30, 30, 30)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBe("preserve")
  })

  it("does not patch elements with near-transparent backgrounds (alpha < 0.1)", () => {
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
  it("removes the base and dynamic style elements", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)
    injectDarkTheme()
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
    expect(document.getElementById(DYNAMIC_STYLE_ID)).not.toBeNull()

    removeDarkTheme()

    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.getElementById(DYNAMIC_STYLE_ID)).toBeNull()
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
  it("tags elements that gained a background after initial injection", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    injectDarkTheme()
    expect(div.dataset.swPatched).toBeUndefined() // no bg yet

    div.style.backgroundColor = "rgb(255, 255, 255)"
    repatchPage()

    const token = div.dataset.swPatched
    expect(token).toMatch(/^c\d+$/)
    if (typeof token === "string") {
      expect(luminanceForToken(token)).toBeLessThan(0.3)
    }
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
  it("removes dark theme (attr + styles + patched attrs)", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)
    applyTheme("dark")

    restoreVendor()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.getElementById(DYNAMIC_STYLE_ID)).toBeNull()
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

  it("leaves vendor DOM byte-identical after apply + restore", () => {
    // #236 invariant: the patcher is attribute-only, so apply + restore must
    // leave the vendor subtree exactly as it was (no inline-style clobbering,
    // no leftover data-sw-patched attrs).
    document.body.innerHTML =
      '<div style="background-color: rgb(255, 255, 255)">' +
      '<p style="background-color: rgb(200, 200, 200)">hi</p></div>'
    const before = document.body.innerHTML

    applyTheme("dark")
    expect(
      document.querySelectorAll("[data-sw-patched]").length
    ).toBeGreaterThan(0)

    restoreVendor()

    expect(document.body.innerHTML).toBe(before)
  })
})
