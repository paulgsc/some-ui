import type { ImageDetails } from "@filter/lib/content/images"
import { shouldInvertImage } from "@filter/lib/content/images"
import { describe, expect, it } from "vitest"

const details = (over: Partial<ImageDetails>): ImageDetails => ({
  isDark: false,
  isLight: false,
  isTransparent: false,
  isLarge: false,
  ...over,
})

describe("shouldInvertImage", () => {
  it("inverts a small dark icon (dark line-art reads better light)", () => {
    expect(shouldInvertImage(details({ isDark: true }))).toBe(true)
  })

  it("leaves a light image alone", () => {
    expect(shouldInvertImage(details({ isLight: true }))).toBe(false)
  })

  it("never inverts a large image (likely a photo)", () => {
    expect(shouldInvertImage(details({ isDark: true, isLarge: true }))).toBe(
      false
    )
  })

  it("leaves an ambiguous image (neither dark nor light) untouched", () => {
    expect(shouldInvertImage(details({}))).toBe(false)
  })

  it("leaves a transparent light image untouched", () => {
    expect(
      shouldInvertImage(details({ isLight: true, isTransparent: true }))
    ).toBe(false)
  })
})
