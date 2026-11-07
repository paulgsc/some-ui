import type { EngagementEvent } from "@engagement/lib/events"
import { EARLY_WAITING, engage, setEngagementSink } from "@engagement/lib/sink"
import { afterEach, describe, expect, it } from "vitest"

const taken: EngagementEvent = {
  kind: "taken",
  pipeline: "topik",
  affordance: "routine-lens",
  surface: "apk",
  at: "2026-11-03T09:00:00.000Z",
}

afterEach(() => {
  setEngagementSink(() => undefined)
  setEngagementSink(null)
})

describe("the page's engagement sink", () => {
  it("holds what comes before the sink is set, then hands it over in order", () => {
    const early = { ...taken, at: "2026-11-03T08:00:00.000Z" }
    engage(early)
    const seen: Array<EngagementEvent> = []
    setEngagementSink((event) => seen.push(event))
    engage(taken)
    expect(seen).toEqual([early, taken])
  })

  it("holds at most EARLY_WAITING before a sink is set", () => {
    for (let i = 0; i <= EARLY_WAITING; i += 1) engage(taken)
    const seen: Array<EngagementEvent> = []
    setEngagementSink((event) => seen.push(event))
    expect(seen).toHaveLength(EARLY_WAITING)
  })
})
