import { describe, expect, it } from "vitest"

import { createTabStateMachine, DEFAULT_TAB_STATE } from "../tab-state"

describe("tab-state", () => {
  it("defaults to auto (themed-by-default)", () => {
    expect(DEFAULT_TAB_STATE).toBe("auto")
  })

  it("cycles legacy → auto → off → legacy", async () => {
    const machine = await createTabStateMachine("legacy")
    expect(machine.cycle()).toBe("auto")
    expect(machine.cycle()).toBe("off")
    expect(machine.cycle()).toBe("legacy")
  })

  it("cycle returns to the start after three steps", async () => {
    const machine = await createTabStateMachine()
    machine.cycle()
    machine.cycle()
    expect(machine.cycle()).toBe(DEFAULT_TAB_STATE)
  })

  it("accepts direct browser-driven transitions", async () => {
    const machine = await createTabStateMachine()
    expect(machine.transitionTo("legacy")).toBe("legacy")
    expect(machine.state).toBe("legacy")
  })
})
