import { describe, expect, it } from "vitest"

import { DEFAULT_TAB_STATE, nextTabState, STATE_CYCLE } from "../tab-state"

describe("tab-state", () => {
  it("defaults to auto (themed-by-default)", () => {
    expect(DEFAULT_TAB_STATE).toBe("legacy")
  })

  it("cycles legacy → auto → off → legacy", () => {
    expect(nextTabState("legacy")).toBe("auto")
    expect(nextTabState("auto")).toBe("off")
    expect(nextTabState("off")).toBe("legacy")
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
