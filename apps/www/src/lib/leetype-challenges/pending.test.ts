import { describe, expect, it } from "vitest"

import { isPoolPending } from "."

/**
 * Regression coverage for the challenge picker offering the bundled demo pool
 * during the corpus fetch. `useLeetypeChallenges` used to return only
 * `Array<Challenge> | undefined`, which collapsed "there is no override" and
 * "the answer isn't back yet" into the same value - so `Leetype` showed the
 * demo pool in its *blocking* picker while `/leetype/challenges.json` was
 * still in flight, and a player who picked immediately latched a challenge
 * from a pool that was about to be replaced.
 *
 * The states below are react-query v5's, named the way it names them.
 */
describe("isPoolPending", () => {
  it("is true while the first fetch is in flight", () => {
    expect(isPoolPending({ isPending: true, isFetching: true })).toBe(true)
  })

  it("is false for a disabled query - the static build never issues a request", () => {
    // The case that makes `isPending` alone the wrong predicate: react-query
    // reports `enabled: false` as pending forever, so keying the picker off it
    // would hang the GitHub Pages build on a fetch that never happens.
    expect(isPoolPending({ isPending: true, isFetching: false })).toBe(false)
  })

  it("is false once the corpus has loaded", () => {
    expect(isPoolPending({ isPending: false, isFetching: false })).toBe(false)
  })

  it("is false after a 404 - a missing corpus is a settled answer, not a wait", () => {
    expect(isPoolPending({ isPending: false, isFetching: false })).toBe(false)
  })

  it("is false during a background refetch, so the picker never flips back to waiting", () => {
    expect(isPoolPending({ isPending: false, isFetching: true })).toBe(false)
  })
})
