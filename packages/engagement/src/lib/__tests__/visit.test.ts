import { checkEvent } from "@engagement/lib/check-event"
import type { EngagementEvent } from "@engagement/lib/events"
import { PIPELINES } from "@engagement/lib/pipelines"
import type { Offer } from "@engagement/lib/visit"
import { createVisit } from "@engagement/lib/visit"
import { describe, expect, it } from "vitest"

const offer = (affordance: string, item: string): Offer => ({
  pipeline: "topik",
  affordance,
  surface: "apk",
  key: `${affordance}:${item}`,
})

const readAloud = offer("routine-read-aloud", "scene/a")
const lens = offer("routine-lens", "scene/a")
const drama = offer("routine-drama", "drama/b")

function visit(): {
  visit: ReturnType<typeof createVisit>
  sent: Array<EngagementEvent>
} {
  const sent: Array<EngagementEvent> = []
  let minute = 0
  const clock = (): Date => new Date(Date.UTC(2026, 10, 7, 9, minute++))
  return { visit: createVisit(clock, (event) => sent.push(event)), sent }
}

const kinds = (sent: ReadonlyArray<EngagementEvent>): Array<string> =>
  sent.map((event) => `${event.kind} ${event.affordance}`)

describe("a visit (ENG3)", () => {
  it("offers each listed card once a visit, however often the list is drawn", () => {
    const { visit: v, sent } = visit()
    v.list([readAloud, lens])
    v.list([readAloud, lens, drama])
    expect(kinds(sent)).toEqual([
      "offered routine-read-aloud",
      "offered routine-lens",
      "offered routine-drama",
    ])
  })

  it("passes over what wasn't taken when it ends, as took-another when one was", () => {
    const { visit: v, sent } = visit()
    v.list([readAloud, lens, drama])
    v.take(readAloud)
    v.end("moved-on")
    const passed = sent.filter((event) => event.kind === "passed-over")
    expect(passed.map((event) => event.affordance)).toEqual([
      "routine-lens",
      "routine-drama",
    ])
    expect(passed[0]).toMatchObject({
      ending: "took-another",
      offeredAt: "2026-11-07T09:01:00.000Z",
    })
  })

  it("ends as the visit did when nothing was taken, and offers again on resume", () => {
    const { visit: v, sent } = visit()
    v.list([drama])
    v.end("left-the-app")
    v.resume()
    v.end("moved-on")
    expect(sent.map((event) => event.kind)).toEqual([
      "offered",
      "passed-over",
      "offered",
      "passed-over",
    ])
    expect(sent[1]).toMatchObject({ ending: "left-the-app" })
  })

  it("writes only events the payload limit passes", () => {
    const { visit: v, sent } = visit()
    v.list([readAloud, lens, drama])
    v.take(lens)
    v.end("left-the-app")
    for (const event of sent)
      expect(checkEvent(event, PIPELINES)).toMatchObject({ ok: true })
  })
})
