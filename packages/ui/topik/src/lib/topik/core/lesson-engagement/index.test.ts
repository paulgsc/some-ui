import { checkEvent, PIPELINES } from "@some-ui/engagement"
import {
  listOffers,
  offerOfSet,
  routineOffer,
} from "@topik/lib/topik/core/lesson-engagement"
import type { LessonItem } from "@topik/lib/topik/core/lesson-feed"
import { describe, expect, it } from "vitest"

const AT = "2026-11-07T09:00:00.000Z"

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

  it("takes a set as the list offers it, its card's once a card holds it", () => {
    const a = scene("scene/a")
    const listed = listOffers([a], ["set-9"])
    expect(routineOffer(a, "lens")).toEqual(listed[1])
    expect(offerOfSet([a], "scene/a-l")).toEqual(listed[1])
    expect(offerOfSet([a], "set-9")).toEqual(listed[2])
    for (const { key: _key, ...stamp } of listed)
      expect(
        checkEvent({ ...stamp, kind: "offered", at: AT }, PIPELINES)
      ).toMatchObject({ ok: true })
  })
})
