import { describe, expect, it } from "vitest"

import { DEFAULT_TAB_STATE, nextTabState, STATE_CYCLE } from "../tab-state"

describe("tab-state", () => {
  it("defaults to auto (themed-by-default)", () => {
    expect(DEFAULT_TAB_STATE).toBe("auto")
  })

  it("cycles auto → legacy → off → auto", () => {
    expect(nextTabState("auto")).toBe("legacy")
    expect(nextTabState("legacy")).toBe("off")
    expect(nextTabState("off")).toBe("auto")
  })

  it("cycle returns to the start after three steps", () => {
    let s = DEFAULT_TAB_STATE
    s = nextTabState(s)
    s = nextTabState(s)
    s = nextTabState(s)
    expect(s).toBe(DEFAULT_TAB_STATE)
  })

  it("covers every state exactly once as a source", () => {
    expect(Object.keys(STATE_CYCLE).sort()).toEqual(["auto", "legacy", "off"])
  })
})
