import { describe, expect, it, vi } from "vitest"

import { createSessionMachine, SessionMachine } from "."
import { createInitialState } from "@chat/lib/topik/core/session-reducer"

describe("SessionMachine", () => {
  it("initializes with createInitialState() by default", () => {
    const machine = createSessionMachine()
    expect(machine.getState()).toEqual(createInitialState())
  })

  it("accepts an explicit initial state (e.g. rehydrated from storage)", () => {
    const custom = { ...createInitialState(), sessionEpoch: 5 }
    const machine = new SessionMachine(custom)
    expect(machine.getState()).toBe(custom)
  })

  describe("dispatch", () => {
    it("returns effects and updates state when the event causes a transition", () => {
      const machine = createSessionMachine()
      const effects = machine.dispatch({ type: "SELECT_TOPIK", key: "topik-1" })

      expect(effects).toEqual([{ type: "TRIGGER_TOPIK_QUERY", key: "topik-1" }])
      expect(machine.getState().phase).toBe("hydrating")
    })

    it("still returns effects (an empty array) when the event is a guarded no-op", () => {
      const machine = createSessionMachine()
      const stateBefore = machine.getState()
      const effects = machine.dispatch({ type: "ADVANCE_MESSAGE" })

      expect(effects).toEqual([])
      // Referentially unchanged - the reducer's `unchanged()` branch fired.
      expect(machine.getState()).toBe(stateBefore)
    })
  })

  describe("subscribe - only notify on change", () => {
    it("does not notify subscribers for a guarded no-op dispatch", () => {
      const machine = createSessionMachine()
      const listener = vi.fn()
      machine.subscribe(listener)

      machine.dispatch({ type: "ADVANCE_MESSAGE" })
      expect(listener).not.toHaveBeenCalled()
    })

    it("notifies subscribers with the new state when it actually changes", () => {
      const machine = createSessionMachine()
      const listener = vi.fn()
      machine.subscribe(listener)

      machine.dispatch({ type: "SELECT_TOPIK", key: "topik-1" })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(machine.getState())
    })

    it("notifies every subscriber, not just the first", () => {
      const machine = createSessionMachine()
      const a = vi.fn()
      const b = vi.fn()
      machine.subscribe(a)
      machine.subscribe(b)

      machine.dispatch({ type: "SELECT_TOPIK", key: "topik-1" })

      expect(a).toHaveBeenCalledTimes(1)
      expect(b).toHaveBeenCalledTimes(1)
    })

    it("stops notifying once unsubscribed", () => {
      const machine = createSessionMachine()
      const listener = vi.fn()
      const unsubscribe = machine.subscribe(listener)

      machine.dispatch({ type: "SELECT_TOPIK", key: "topik-1" })
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()
      machine.dispatch({ type: "CHANGE_TOPIK" })
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe("destroy", () => {
    it("clears all listeners so no further notifications fire", () => {
      const machine = createSessionMachine()
      const listener = vi.fn()
      machine.subscribe(listener)

      machine.destroy()
      machine.dispatch({ type: "SELECT_TOPIK", key: "topik-1" })

      expect(listener).not.toHaveBeenCalled()
      // destroy() only clears listener bookkeeping - dispatch still works.
      expect(machine.getState().phase).toBe("hydrating")
    })
  })
})
