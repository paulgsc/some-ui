/**
 * The per-build rule over what the web's navigation offers (ADM1, #2389):
 * the home network's build is administration-first, and every other build
 * offers what viewers try and no administration.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import type { Purpose } from "@/lib/purpose"
import { offeredHere } from "@/lib/purpose"

let audiences: ReadonlyArray<string> = []

vi.mock("@/lib/build-profile", () => ({
  hasAudience: (audience: string): boolean => audiences.includes(audience),
}))

const PURPOSES: ReadonlyArray<Purpose> = [
  "administration",
  "presentation",
  "study",
  "making",
]

function offered(): ReadonlyArray<Purpose> {
  return PURPOSES.filter(offeredHere)
}

afterEach(() => {
  audiences = []
})

describe("offeredHere", () => {
  it("offers the home network's build administration and presentation, and no study or making", () => {
    audiences = ["public", "lan", "web"]
    expect(offered()).toEqual(["administration", "presentation"])
  })

  it("offers the public site everything viewers try, and no administration", () => {
    audiences = ["public", "web"]
    expect(offered()).toEqual(["presentation", "study", "making"])
  })
})
