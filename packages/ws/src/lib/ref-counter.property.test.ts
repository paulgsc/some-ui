import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"

import { ReferenceCounter } from "./ref-counter"

type Op = "acquire" | "release" | "reset"

const opArbitrary: fc.Arbitrary<Op> = fc.constantFrom(
  "acquire",
  "release",
  "reset"
)

describe("ReferenceCounter - shadow-model agreement under random acquire/release/reset sequences", () => {
  it("never goes negative, and onZero fires exactly once per 1->0 transition via release (not reset)", () => {
    fc.assert(
      fc.property(
        fc.array(opArbitrary, { minLength: 0, maxLength: 50 }),
        (ops) => {
          const onZero = vi.fn()
          const counter = new ReferenceCounter({ onZero })

          let model = 0
          let expectedZeroCalls = 0

          for (const op of ops) {
            if (op === "acquire") {
              model++
              expect(counter.acquire()).toBe(model)
            } else if (op === "release") {
              if (model <= 0) {
                expect(() => counter.release()).toThrow(
                  /Cannot release, count is already 0/
                )
                // rejected release must not touch state
              } else {
                model--
                const returned = counter.release()
                expect(returned).toBe(model)
                if (model === 0) expectedZeroCalls++
              }
            } else {
              model = 0
              counter.reset()
              // reset is a hard reset, not a release - must not trigger onZero
            }

            expect(counter.current).toBe(model)
            expect(counter.hasReferences).toBe(model > 0)
            expect(onZero).toHaveBeenCalledTimes(expectedZeroCalls)
          }
        }
      )
    )
  })
})

describe("ReferenceCounter - regression", () => {
  it("starts at zero with no references", () => {
    const counter = new ReferenceCounter()
    expect(counter.current).toBe(0)
    expect(counter.hasReferences).toBe(false)
  })

  it("throws on release from zero and does not construct a negative count", () => {
    const counter = new ReferenceCounter()
    expect(() => counter.release()).toThrow(
      "ReferenceCounter: Cannot release, count is already 0"
    )
    expect(counter.current).toBe(0)
  })

  it("calls onZero exactly once when the last reference is released, not per release", () => {
    const onZero = vi.fn()
    const counter = new ReferenceCounter({ onZero })

    counter.acquire()
    counter.acquire()
    counter.release()
    expect(onZero).not.toHaveBeenCalled()

    counter.release()
    expect(onZero).toHaveBeenCalledOnce()
  })

  it("fires onZero again after re-acquiring and releasing to zero a second time", () => {
    const onZero = vi.fn()
    const counter = new ReferenceCounter({ onZero })

    counter.acquire()
    counter.release()
    counter.acquire()
    counter.release()

    expect(onZero).toHaveBeenCalledTimes(2)
  })

  it("reset() zeroes the count without invoking onZero", () => {
    const onZero = vi.fn()
    const counter = new ReferenceCounter({ onZero })

    counter.acquire()
    counter.acquire()
    counter.reset()

    expect(counter.current).toBe(0)
    expect(onZero).not.toHaveBeenCalled()
  })

  it("works with no onZero callback provided", () => {
    const counter = new ReferenceCounter()
    counter.acquire()
    expect(() => counter.release()).not.toThrow()
  })
})
