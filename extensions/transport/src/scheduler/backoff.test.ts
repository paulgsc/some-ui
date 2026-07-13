import { describe, expect, it } from "vitest"

import {
  advanceRetry,
  initialRetryState,
  isExhausted,
  nextDelay,
  type BackoffPolicy,
} from "./backoff"

const policy: BackoffPolicy = {
  initialDelayMs: 100,
  maxDelayMs: 1000,
  factor: 2,
  maxAttempts: 5,
}

describe("scheduler/backoff — nextDelay", () => {
  it("grows exponentially by the configured factor", () => {
    expect(nextDelay(policy, 0)).toBe(100)
    expect(nextDelay(policy, 1)).toBe(200)
    expect(nextDelay(policy, 2)).toBe(400)
  })

  it("never exceeds maxDelayMs", () => {
    expect(nextDelay(policy, 10)).toBe(1000)
  })
})

describe("scheduler/backoff — isExhausted / advanceRetry", () => {
  it("is not exhausted before maxAttempts", () => {
    expect(isExhausted(policy, 0)).toBe(false)
    expect(isExhausted(policy, policy.maxAttempts - 1)).toBe(false)
  })

  it("is exhausted at or past maxAttempts", () => {
    expect(isExhausted(policy, policy.maxAttempts)).toBe(true)
  })

  it("the retry sequence terminates — it is never silently infinite without a cap", () => {
    let state = initialRetryState()
    let steps = 0
    for (;;) {
      const next = advanceRetry(policy, state)
      if (next === undefined) {
        break
      }
      state = next.state
      steps++
      if (steps > policy.maxAttempts + 1) {
        throw new Error("advanceRetry did not terminate within maxAttempts")
      }
    }
    expect(steps).toBe(policy.maxAttempts)
  })

  it("each step's delay matches nextDelay for its attempt number", () => {
    const state = initialRetryState()
    const step = advanceRetry(policy, state)
    expect(step?.delayMs).toBe(nextDelay(policy, 0))
    expect(step?.state.attempt).toBe(1)
  })
})
