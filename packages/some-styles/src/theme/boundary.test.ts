/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest"

import { appearanceClassName, appearanceProps, applyAppearance } from "./index"

describe("appearanceProps", () => {
  it("emits nothing for the inherit default", () => {
    expect(appearanceProps("inherit")).toEqual({})
    expect(appearanceClassName("inherit")).toBe("")
  })

  it("emits the boundary contract for a feature appearance", () => {
    expect(appearanceProps("code")).toEqual({
      className: "code",
      "data-appearance": "code",
    })
  })

  it("never emits a session theme class", () => {
    // The type already forbids it; this pins the runtime behaviour so a cast
    // or a JS caller cannot use this helper to force the user's theme.
    for (const id of ["dark", "light", "peachy-blossom", "strawberry-moon"]) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately handing the helper a value its type forbids, which is the whole point: the guard has to hold for a JS caller or a cast too.
      expect(appearanceProps(id as "code")).toEqual({})
    }
  })
})

describe("applyAppearance", () => {
  it("replaces a previously applied feature boundary", () => {
    const element = document.createElement("div")
    applyAppearance(element, "code")
    expect(element.classList.contains("code")).toBe(true)
    expect(element.dataset.appearance).toBe("code")

    applyAppearance(element, "cdrama")
    expect(element.classList.contains("code")).toBe(false)
    expect(element.classList.contains("cdrama")).toBe(true)
  })

  it("clears back to inherit and leaves unrelated classes intact", () => {
    const element = document.createElement("div")
    element.classList.add("flex", "dark")
    applyAppearance(element, "topik")
    applyAppearance(element, "inherit")

    expect(element.dataset.appearance).toBeUndefined()
    expect(Array.from(element.classList).sort()).toEqual(["dark", "flex"])
  })
})
