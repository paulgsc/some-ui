import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { LifecycleStateMachine, type LifecycleState } from "."

/**
 * Independent model of the legal-transitions contract `lifecycle.ts` claims
 * to implement - kept separate from the source so these properties check
 * the FSM's behavior against a spec, not against itself.
 */
const allStates: ReadonlyArray<LifecycleState> = [
  "idle",
  "initializing",
  "initialized",
  "disposing",
]

const modelTransitions: Record<
  LifecycleState,
  ReadonlyArray<LifecycleState>
> = {
  idle: ["initializing", "disposing"],
  initializing: ["initialized", "disposing", "idle"],
  initialized: ["disposing"],
  disposing: ["idle"],
}

const stateArbitrary: fc.Arbitrary<LifecycleState> = fc.constantFrom(
  ...allStates
)

describe("LifecycleStateMachine - canTransitionTo matches the independent transition spec", () => {
  it("agrees with the model for every (state, target) pair", () => {
    fc.assert(
      fc.property(stateArbitrary, stateArbitrary, (from, target) => {
        const machine = new LifecycleStateMachine()
        // Drive the machine to `from` via a legal path where possible; `idle`
        // is the only state reachable with zero transitions.
        if (from !== "idle") {
          // every non-idle state is directly reachable from idle in this FSM
          if (modelTransitions.idle.includes(from)) {
            machine.transitionTo(from)
          } else {
            // initialized is reached via idle -> initializing -> initialized
            machine.transitionTo("initializing")
            machine.transitionTo(from)
          }
        }

        expect(machine.canTransitionTo(target)).toBe(
          modelTransitions[from].includes(target)
        )
      })
    )
  })
})

describe("LifecycleStateMachine - transitionTo never mutates state on a rejected transition", () => {
  it("throws and leaves `current` unchanged for any illegal transition", () => {
    fc.assert(
      fc.property(stateArbitrary, stateArbitrary, (from, target) => {
        const machine = new LifecycleStateMachine()
        if (from !== "idle") {
          if (modelTransitions.idle.includes(from)) {
            machine.transitionTo(from)
          } else {
            machine.transitionTo("initializing")
            machine.transitionTo(from)
          }
        }

        const isLegal = modelTransitions[from].includes(target)
        if (isLegal) return // covered by the success-path test below

        expect(() => machine.transitionTo(target)).toThrow(
          /Invalid lifecycle transition/
        )
        expect(machine.current).toBe(from)
      })
    )
  })
})

describe("LifecycleStateMachine - shadow-model agreement under random attempted sequences", () => {
  it("tracks an independent step model across any sequence of transition attempts", () => {
    // The model applies the same "attempt, ignore if illegal" rule a caller
    // following the documented contract would use - this is the property
    // that matters for consumers like WebSocketManager, which drive the
    // machine through many attempted transitions over its lifetime.
    const attempt = (
      state: LifecycleState,
      target: LifecycleState
    ): LifecycleState =>
      modelTransitions[state].includes(target) ? target : state

    fc.assert(
      fc.property(
        fc.array(stateArbitrary, { minLength: 0, maxLength: 30 }),
        (targets) => {
          const machine = new LifecycleStateMachine()
          let modelState: LifecycleState = "idle"

          for (const target of targets) {
            try {
              machine.transitionTo(target)
            } catch {
              // illegal transition attempt - machine is documented to reject
              // and leave state untouched, matching the model's no-op branch
            }
            modelState = attempt(modelState, target)
            expect(machine.current).toBe(modelState)
          }
        }
      )
    )
  })
})

describe("LifecycleStateMachine - regression: the documented lifecycle diagram", () => {
  it("walks idle -> initializing -> initialized -> disposing -> idle", () => {
    const machine = new LifecycleStateMachine()
    expect(machine.current).toBe("idle")

    machine.transitionTo("initializing")
    expect(machine.current).toBe("initializing")
    expect(machine.is("initializing")).toBe(true)

    machine.transitionTo("initialized")
    expect(machine.current).toBe("initialized")

    machine.transitionTo("disposing")
    expect(machine.current).toBe("disposing")

    machine.transitionTo("idle")
    expect(machine.current).toBe("idle")
  })

  it("regression: an initializing attempt can be cancelled straight back to idle", () => {
    const machine = new LifecycleStateMachine()
    machine.transitionTo("initializing")
    machine.transitionTo("idle")
    expect(machine.current).toBe("idle")
  })

  it("regression: initialized can only go to disposing, never back to idle or initializing", () => {
    const machine = new LifecycleStateMachine()
    machine.transitionTo("initializing")
    machine.transitionTo("initialized")

    expect(() => machine.transitionTo("idle")).toThrow()
    expect(() => machine.transitionTo("initializing")).toThrow()
    expect(machine.current).toBe("initialized")
  })

  it("reset() always returns to idle regardless of current state", () => {
    const machine = new LifecycleStateMachine()
    machine.transitionTo("initializing")
    machine.transitionTo("initialized")
    machine.transitionTo("disposing")

    machine.reset()

    expect(machine.current).toBe("idle")
  })

  it("isOneOf reports true iff current is among the listed states", () => {
    const machine = new LifecycleStateMachine()
    expect(machine.isOneOf("initializing", "initialized")).toBe(false)

    machine.transitionTo("initializing")
    expect(machine.isOneOf("initializing", "initialized")).toBe(true)
    expect(machine.isOneOf("idle", "disposing")).toBe(false)
  })
})
