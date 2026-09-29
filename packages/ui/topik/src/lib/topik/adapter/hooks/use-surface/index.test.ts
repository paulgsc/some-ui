import { describe, expect, it } from "vitest"

import { chooseSurface, isShort } from "."

describe("chooseSurface", () => {
  it("keeps the desktop surface for an unmeasured box", () => {
    expect(chooseSurface({ width: 0, height: 0 })).toBe("desktop")
  })

  it("matches the ui-fit viewport matrix", () => {
    expect(chooseSurface({ width: 1280, height: 560 })).toBe("desktop")
    expect(chooseSurface({ width: 1680, height: 1050 })).toBe("desktop")
    expect(chooseSurface({ width: 390, height: 720 })).toBe("handheld")
    // Wide enough to pass a width test, too short for the desktop layout.
    expect(chooseSurface({ width: 780, height: 390 })).toBe("handheld")
  })

  it("switches exactly where the desktop session starts stacking", () => {
    expect(chooseSurface({ width: 767, height: 900 })).toBe("handheld")
    expect(chooseSurface({ width: 768, height: 900 })).toBe("desktop")
  })

  it("flags short boxes for the two-column layout", () => {
    expect(isShort({ width: 780, height: 390 })).toBe(true)
    expect(isShort({ width: 390, height: 720 })).toBe(false)
  })
})
