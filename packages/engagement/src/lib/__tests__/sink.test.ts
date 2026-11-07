import type { EngagementEvent } from "@engagement/lib/events"
import { engage, setEngagementSink } from "@engagement/lib/sink"
import { afterEach, describe, expect, it } from "vitest"

const taken: EngagementEvent = {
  kind: "taken",
  pipeline: "topik",
  affordance: "routine-lens",
  surface: "apk",
  at: "2026-11-03T09:00:00.000Z",
}

afterEach(() => {
  setEngagementSink(null)
})

describe("the page's engagement sink", () => {
  it("hands each event to the sink set, and drops it with none", () => {
    engage(taken)
    const seen: Array<EngagementEvent> = []
    setEngagementSink((event) => seen.push(event))
    engage(taken)
    setEngagementSink(null)
    engage(taken)
    expect(seen).toEqual([taken])
  })
})
