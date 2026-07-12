import { describe, expect, it } from "vitest"

import { excludeActuatorSubtree, isWithinActuatorSubtree } from "./exclude"
import { tag } from "./self-tag"

describe("actuator/exclude — structural exclusion (Corollary 7.3.1)", () => {
  it("excludes a self-tagged element itself", () => {
    const el = document.createElement("div")
    tag(el, "k1")
    expect(isWithinActuatorSubtree(el)).toBe(true)
  })

  it("excludes a descendant of a self-tagged ancestor, even though the descendant itself is untagged", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")
    parent.appendChild(child)
    tag(parent, "k1")

    expect(isWithinActuatorSubtree(child, parent)).toBe(true)
  })

  it("does not exclude a node outside any actuator-owned subtree", () => {
    const vendorNode = document.createElement("div")
    expect(isWithinActuatorSubtree(vendorNode)).toBe(false)
  })

  it("excludeActuatorSubtree filters a candidate set down to only vendor-authored nodes", () => {
    const root = document.createElement("div")
    const veil = document.createElement("div") // actuator's own overlay
    const vendorCard = document.createElement("div") // genuine vendor content
    tag(veil, "veil")
    root.appendChild(veil)
    root.appendChild(vendorCard)

    const candidates = [veil, vendorCard]
    const filtered = excludeActuatorSubtree(candidates, root)

    expect(filtered).toEqual([vendorCard])
  })

  it("regression (the prepaint corollary, 7.3.1): sampling without structural exclusion reads the actuator's own veil as vendor evidence — proving the helper is load-bearing, not a no-op", () => {
    const root = document.createElement("div")
    const veil = document.createElement("div")
    veil.setAttribute("data-detected-color", "veil-color")
    tag(veil, "veil")
    root.appendChild(veil)

    // Without exclusion, a naive detector samples the veil directly.
    const naiveSample = Array.from(
      root.querySelectorAll("[data-detected-color]")
    )
    expect(naiveSample).toHaveLength(1) // the bug this corollary exists to prevent

    // With structural exclusion applied first, the veil never reaches the
    // detector's sampling at all.
    const excluded = excludeActuatorSubtree(naiveSample, root)
    expect(excluded).toHaveLength(0)
  })
})
