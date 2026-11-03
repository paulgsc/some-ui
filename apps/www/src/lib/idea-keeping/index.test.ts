/**
 * @vitest-environment node
 *
 * What Studio's idea screens hand the home link (ST26 (b), `./index`): the
 * hand-in itself moves the voice lane, so an idea sent on an earlier launch
 * goes once a route hands the ideas in, without waiting for another change.
 */
import { describe, expect, it, vi } from "vitest"

import { ideasMoved, keepIdeas } from "@/lib/idea-keeping"

describe("the ideas handed in (ST26 b)", () => {
  it("tells the voice lane once, at the first hand-in", () => {
    const moved = vi.fn()
    const stop = ideasMoved.subscribe(moved)
    const before = ideasMoved.getSnapshot()
    keepIdeas({ forHome: () => [] })
    keepIdeas({ forHome: () => [] })
    expect(moved).toHaveBeenCalledTimes(1)
    expect(ideasMoved.getSnapshot()).toBe(before + 1)
    stop()
  })
})
