import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { withTimeout } from "."

describe("withTimeout Unit & Regression Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves normally when promise completes before timeout", async () => {
    const p = new Promise<string>((resolve) =>
      setTimeout(() => resolve("done"), 100)
    )
    const resPromise = withTimeout(p, 500)

    vi.advanceTimersByTime(100)
    await expect(resPromise).resolves.toBe("done")
  })

  it("rejects with timeout error when time exceeds limit", async () => {
    const p = new Promise<string>(() => {}) // never resolves
    const resPromise = withTimeout(p, 500)

    vi.advanceTimersByTime(500)
    await expect(resPromise).rejects.toThrow("Timeout after 500ms")
  })

  it("REGRESSION TEST: immediately rejects if signal is ALREADY aborted", async () => {
    const controller = new AbortController()
    const customReason = new Error("Pre-aborted reason")
    controller.abort(customReason)

    const p = Promise.resolve("should not return this")
    const resPromise = withTimeout(p, 1000, controller.signal)

    await expect(resPromise).rejects.toBe(customReason)
  })

  it("REGRESSION TEST: removes abort listener when timeout wins", async () => {
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener")

    const p = new Promise(() => {}) // pending
    const resPromise = withTimeout(p, 200, controller.signal)

    vi.advanceTimersByTime(200)
    await expect(resPromise).rejects.toThrow("Timeout after 200ms")

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function))
  })

  it("REGRESSION TEST: preserves custom abort reason when aborted mid-flight", async () => {
    const controller = new AbortController()
    const customReason = new Error("Custom abort message")

    const p = new Promise(() => {})
    const resPromise = withTimeout(p, 1000, controller.signal)

    controller.abort(customReason)
    await expect(resPromise).rejects.toBe(customReason)
  })

  it("REGRESSION TEST: safely handles synchronous errors via factory functions", async () => {
    const throwingFactory = (): Promise<void> => {
      throw new Error("Sync failure inside factory")
    }

    const resPromise = withTimeout(throwingFactory, 1000)
    await expect(resPromise).rejects.toThrow("Sync failure inside factory")
  })
})

describe("withTimeout Property Tests (fast-check)", () => {
  it("Property 1: Outcome is strictly deterministic based on shortest timer delay", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Ensure distinct non-zero delays to prevent race ambiguity in fake timers
        fc.uniqueArray(fc.integer({ min: 10, max: 500 }), {
          minLength: 3,
          maxLength: 3,
        }),
        async ([d1, d2, d3]) => {
          vi.useFakeTimers()

          // Randomize which role gets which delay
          const promiseDelay = d1
          const timeoutMs = d2
          const abortDelay = d3

          const controller = new AbortController()
          const abortReason = new Error("abort-win")

          const p = new Promise<string>((resolve) => {
            setTimeout(() => resolve("promise-win"), promiseDelay)
          })

          const abortTimer = setTimeout(() => {
            controller.abort(abortReason)
          }, abortDelay)

          const wrapped = withTimeout(p, timeoutMs, controller.signal)

          const minDelay = Math.min(promiseDelay, timeoutMs, abortDelay)
          vi.advanceTimersByTime(minDelay)
          clearTimeout(abortTimer)

          if (minDelay === promiseDelay) {
            await expect(wrapped).resolves.toBe("promise-win")
          } else if (minDelay === abortDelay) {
            await expect(wrapped).rejects.toBe(abortReason)
          } else {
            await expect(wrapped).rejects.toThrow(
              `Timeout after ${timeoutMs}ms`
            )
          }

          vi.useRealTimers()
        }
      )
    )
  })

  it("Property 2: Equivalence - Promise input and Factory input produce identical outcomes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 200 }),
        fc.integer({ min: 10, max: 200 }),
        fc.boolean(),
        async (delay, timeout, shouldSucceed) => {
          // Test Raw Promise branch
          vi.useFakeTimers()
          const pA = new Promise<string>((resolve, reject) => {
            setTimeout(() => {
              if (shouldSucceed) resolve("ok")
              else reject(new Error("fail"))
            }, delay)
          })
          const resA = withTimeout(pA, timeout)
          vi.advanceTimersByTime(Math.max(delay, timeout) + 10)

          let outcomeA: unknown
          try {
            outcomeA = await resA
          } catch (err) {
            outcomeA = err
          }
          vi.useRealTimers()

          // Test Factory/Thunk branch in an isolated timer context
          vi.useFakeTimers()
          const resB = withTimeout(
            () =>
              new Promise<string>((resolve, reject) => {
                setTimeout(() => {
                  if (shouldSucceed) resolve("ok")
                  else reject(new Error("fail"))
                }, delay)
              }),
            timeout
          )
          vi.advanceTimersByTime(Math.max(delay, timeout) + 10)

          let outcomeB: unknown
          try {
            outcomeB = await resB
          } catch (err) {
            outcomeB = err
          }
          vi.useRealTimers()

          // Invariant: Factory and Promise inputs must produce identical outputs/errors
          expect(outcomeA).toEqual(outcomeB)
        }
      )
    )
  })

  it("Property 3: Invariant - Event listener is ALWAYS cleaned up post-settlement", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 200 }),
        fc.integer({ min: 10, max: 200 }),
        fc.integer({ min: 10, max: 200 }),
        async (promiseDelay, timeoutMs, abortDelay) => {
          vi.useFakeTimers()

          const controller = new AbortController()
          const removeSpy = vi.spyOn(controller.signal, "removeEventListener")

          const p = new Promise<string>((resolve) => {
            setTimeout(() => resolve("done"), promiseDelay)
          })

          const abortTimer = setTimeout(() => {
            controller.abort("stop")
          }, abortDelay)

          const wrapped = withTimeout(p, timeoutMs, controller.signal)

          vi.advanceTimersByTime(
            Math.max(promiseDelay, timeoutMs, abortDelay) + 10
          )
          clearTimeout(abortTimer)

          // Absorb outcome
          await wrapped.catch(() => {})

          // Invariant: removeEventListener was executed exactly once
          expect(removeSpy).toHaveBeenCalledTimes(1)
          expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function))

          vi.useRealTimers()
        }
      )
    )
  })
})
