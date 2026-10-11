import { describe, expect, it } from "vitest"

import { runsNatively } from "@/lib/intent/foreign"

describe("runsNatively", () => {
  it("asks the native bridge's Capacitor global, and is false without one", () => {
    expect(runsNatively({})).toBe(false)
    expect(runsNatively({ Capacitor: {} })).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => false } })
    ).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => true } })
    ).toBe(true)
  })
})
