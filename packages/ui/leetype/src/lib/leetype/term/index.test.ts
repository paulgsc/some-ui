import { describe, expect, it } from "vitest"

import type { TermPorts } from "."
import { Term } from "."

/** A clock a test moves by hand, and the one timer it may set. */
function manualClock(): TermPorts & {
  pass: (ms: number) => void
  armed: () => boolean
} {
  let t = 0
  let timer: { at: number; fire: () => void } | null = null
  return {
    now: () => t,
    after: (ms, fire) => {
      const mine = { at: t + ms, fire }
      timer = mine
      return () => {
        if (timer === mine) timer = null
      }
    },
    pass: (ms): void => {
      t += ms
      if (timer !== null && timer.at <= t) {
        const { fire } = timer
        timer = null
        fire()
      }
    },
    armed: () => timer !== null,
  }
}

const MIN = 60_000

describe("Term (SS2: leetype's term waits with its session)", () => {
  it("counts nothing until the host first lets it play", () => {
    const clock = manualClock()
    const term = new Term(10 * MIN, 0, clock)
    clock.pass(3 * MIN)
    expect(term.spent()).toBe(0)
    expect(clock.armed()).toBe(false)
    term.release()
    clock.pass(MIN)
    expect(term.left()).toBe(9 * MIN)
  })

  it("stands still while the session waits, and runs out only on time played", () => {
    const clock = manualClock()
    const term = new Term(10 * MIN, 0, clock)
    term.release()
    clock.pass(4 * MIN)
    term.hold()
    clock.pass(30 * MIN)
    expect(term.spent()).toBe(4 * MIN)
    expect(term.hasExpired()).toBe(false)
    term.hold()
    term.release()
    term.release()
    clock.pass(6 * MIN - 1)
    expect(term.hasExpired()).toBe(false)
    clock.pass(1)
    expect(term.hasExpired()).toBe(true)
  })

  it("goes on from what an earlier mount spent, not a fresh term", () => {
    const clock = manualClock()
    const term = new Term(10 * MIN, 7 * MIN, clock)
    expect(term.left()).toBe(3 * MIN)
    term.release()
    clock.pass(3 * MIN)
    expect(term.hasExpired()).toBe(true)
  })

  it("has already run out when an earlier mount spent all of it", () => {
    const term = new Term(10 * MIN, 10 * MIN, manualClock())
    expect(term.hasExpired()).toBe(true)
    expect(term.left()).toBe(0)
  })

  it("tells its subscribers as it runs out and as a restart takes that back", () => {
    const clock = manualClock()
    const term = new Term(MIN, 0, clock)
    const seen: Array<boolean> = []
    term.subscribe(() => seen.push(term.hasExpired()))
    term.release()
    clock.pass(MIN)
    term.restart()
    expect(term.left()).toBe(MIN)
    clock.pass(MIN)
    expect(seen).toEqual([true, false, true])
  })

  it("keeps what was spent when the scene's duration changes", () => {
    const clock = manualClock()
    const term = new Term(10 * MIN, 0, clock)
    term.release()
    clock.pass(4 * MIN)
    term.setDuration(5 * MIN)
    expect(term.left()).toBe(MIN)
    clock.pass(MIN)
    expect(term.hasExpired()).toBe(true)
  })
})
