/**
 * The veil's class list, asserted as strings: cheap, so removing a guard is a
 * red diff rather than a screenshot. That the utilities exist is the build's
 * (and `styles.test.ts`'s) to prove.
 */

import { VEIL } from "@censor/lib/content/veil-styles"
import { describe, expect, it } from "vitest"

describe("the veil", () => {
  it("leads with the identity class the e2e suite keys off", () => {
    expect(VEIL.startsWith("boyo-veil ")).toBe(true)
  })

  it("covers the whole card and stays inside it", () => {
    for (const token of ["absolute", "inset-0", "overflow-hidden"]) {
      expect(VEIL.split(" ")).toContain(token)
    }
  })

  it("occludes, and takes the pointer so nothing under it plays or opens", () => {
    expect(VEIL).toContain("backdrop-blur-20px")
    expect(VEIL).toContain("pointer-events-auto")
  })
})
