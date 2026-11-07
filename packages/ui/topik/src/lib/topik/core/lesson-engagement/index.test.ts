import { checkEvent, createVisit, PIPELINES } from "@some-ui/engagement"
import type { EngagementEvent } from "@some-ui/engagement"
import {
  listOffers,
  routineOffer,
} from "@topik/lib/topik/core/lesson-engagement"
import type { LessonItem } from "@topik/lib/topik/core/lesson-feed"
import { describe, expect, it } from "vitest"

const scene = (key: string): LessonItem => ({
  key,
  kind: "scene",
  name: key,
  level: 1,
  genre: undefined,
  premise: undefined,
  opened: false,
  sessions: [
    { practice: "read-aloud", id: `${key}-r`, size: "12 words", opened: false },
    { practice: "lens", id: `${key}-l`, size: "8 lines", opened: false },
  ],
})

const drama = (key: string): LessonItem => ({
  ...scene(key),
  kind: "drama",
  sessions: [],
})

describe("what the lesson list offers (ENG3)", () => {
  it("offers each shown scene's two sets apart, a drama as itself, then the ready sets", () => {
    const items = [
      scene("scene/a"),
      drama("drama/b"),
      scene("scene/c"),
      scene("scene/d"),
    ]
    expect(listOffers(items, ["set-9"]).map((offer) => offer.key)).toEqual([
      "routine-read-aloud:scene/a",
      "routine-lens:scene/a",
      "routine-drama:drama/b",
      "routine-read-aloud:scene/c",
      "routine-lens:scene/c",
      "ready-set:set-9",
    ])
  })

  it("takes the set pressed, and passes the scene's other set over", () => {
    const sent: Array<EngagementEvent> = []
    const visit = createVisit(
      () => new Date(Date.UTC(2026, 10, 7, 9)),
      (event) => sent.push(event)
    )
    const a = scene("scene/a")
    visit.list(listOffers([a, drama("drama/b")], []))
    visit.take(routineOffer(a, "lens"))
    visit.end("moved-on")
    expect(
      sent
        .filter((event) => event.kind !== "offered")
        .map((event) => `${event.kind} ${event.affordance}`)
    ).toEqual([
      "taken routine-lens",
      "passed-over routine-read-aloud",
      "passed-over routine-drama",
    ])
    for (const event of sent)
      expect(checkEvent(event, PIPELINES)).toMatchObject({ ok: true })
  })
})
