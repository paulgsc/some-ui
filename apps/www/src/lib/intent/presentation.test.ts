import { describe, expect, it } from "vitest"

import { presentationPolicyFor } from "./presentation"

describe("presentationPolicyFor", () => {
  it("interactive: may interrupt, requires a visible retry, never silent", () => {
    const policy = presentationPolicyFor("interactive")
    expect(policy.mayInterruptOnFailure).toBe(true)
    expect(policy.requiresVisibleRetryAffordance).toBe(true)
    expect(policy.failureMayBeSilent).toBe(false)
    expect(policy.failureMustSurviveNavigation).toBe(false)
  })

  it("ambient: never interrupts, no forced retry affordance, never silent", () => {
    const policy = presentationPolicyFor("ambient")
    expect(policy.mayInterruptOnFailure).toBe(false)
    expect(policy.requiresVisibleRetryAffordance).toBe(false)
    expect(policy.failureMayBeSilent).toBe(false)
    expect(policy.failureMustSurviveNavigation).toBe(false)
  })

  it("ambient-durable: never interrupts, but a failure must survive navigation - the autosave verdict", () => {
    const policy = presentationPolicyFor("ambient-durable")
    expect(policy.mayInterruptOnFailure).toBe(false)
    expect(policy.failureMayBeSilent).toBe(false)
    expect(policy.failureMustSurviveNavigation).toBe(true)
  })

  it("failureMayBeSilent is false for every mode - not a per-mode choice", () => {
    const modes = ["interactive", "ambient", "ambient-durable"] as const
    for (const mode of modes) {
      expect(presentationPolicyFor(mode).failureMayBeSilent).toBe(false)
    }
  })

  it("only ambient-durable requires a failure to survive navigation", () => {
    expect(
      presentationPolicyFor("interactive").failureMustSurviveNavigation
    ).toBe(false)
    expect(presentationPolicyFor("ambient").failureMustSurviveNavigation).toBe(
      false
    )
    expect(
      presentationPolicyFor("ambient-durable").failureMustSurviveNavigation
    ).toBe(true)
  })
})
