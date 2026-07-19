import { afterEach, describe, expect, it } from "vitest"

import {
  applyTheme,
  DARK_THEME_ATTR,
  injectDarkTheme,
  removeDarkTheme,
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

  it("does not write data-sw-patched anywhere — that is the actuator's job now", () => {
    const div = document.createElement("div")
    div.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.appendChild(div)

    injectDarkTheme()

    expect(div.dataset.swPatched).toBeUndefined()
  })
})

describe("removeDarkTheme", () => {
  it("removes the base style element", () => {
    injectDarkTheme()
    expect(document.getElementById(STYLE_ID)).not.toBeNull()

    removeDarkTheme()

    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it("is safe to call when no theme has been injected", () => {
    expect(() => removeDarkTheme()).not.toThrow()
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

  it("'legacy' with invert forces the canvas colour and counter-inverts media", () => {
    applyTheme("legacy", { invert: 1, brightness: 0.5 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style?.textContent).toContain("background-color: #0d1117")
    expect(style?.textContent).toContain(
      "img, video, canvas, picture { filter: invert(1) hue-rotate(180deg)"
    )
  })

  it("'legacy' without invert (dim style) skips the canvas colour and media counter-invert", () => {
    applyTheme("legacy", { invert: 0, brightness: 0.7, contrast: 0.95 })
    const style = document.getElementById(LEGACY_STYLE_ID)
    expect(style?.textContent).toContain("brightness(0.7)")
    expect(style?.textContent).not.toContain("background-color: #0d1117")
    expect(style?.textContent).not.toContain("img, video, canvas, picture")
  })
})

describe("restoreVendor", () => {
  it("removes dark theme (attr + style)", () => {
    applyTheme("dark")

    restoreVendor()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
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

  it("never writes inline styles or data-sw-patched — this module only ever touches its own style elements and DARK_THEME_ATTR", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(255, 255, 255)">' +
      '<p style="background-color: rgb(200, 200, 200)">hi</p></div>'
    const before = document.body.innerHTML

    applyTheme("dark")
    restoreVendor()

    expect(document.body.innerHTML).toBe(before)
  })
})
