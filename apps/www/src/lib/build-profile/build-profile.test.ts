import { isNotFound } from "@tanstack/react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

const carried = vi.hoisted(() => ({ audiences: new Set<string>(["public"]) }))

vi.mock("virtual:build-profile", () => ({
  profile: "test",
  audiences: [],
  hasAudience: (audience: string): boolean => carried.audiences.has(audience),
}))

// Imported after the mock is registered (vi.mock is hoisted above imports).
const { requireAudience } = await import("@/lib/build-profile")

function thrownBy(guard: () => void): unknown {
  try {
    guard()
  } catch (error) {
    return error
  }
  return undefined
}

describe("requireAudience", () => {
  afterEach(() => {
    carried.audiences = new Set(["public"])
  })

  it("sends a visit to not-found when the build leaves the audience out", () => {
    expect(isNotFound(thrownBy(requireAudience("lan")))).toBe(true)
  })

  it("lets the route load when the build carries the audience", () => {
    carried.audiences = new Set(["public", "lan"])

    expect(thrownBy(requireAudience("lan"))).toBeUndefined()
  })
})
