import { checkEvent, PIPELINES } from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

import { HOME_OFFERS, studyCardOffers } from "@/lib/practice-home"

describe("what Practice Home offers", () => {
  it("offers Start or Resume, TOPIK's two while shown, and Say why until studied", () => {
    const keys = (card: Parameters<typeof studyCardOffers>[0]): Array<string> =>
      studyCardOffers(card).map((offer) => offer.key)
    expect(keys({ open: false, lessons: true, done: false })).toEqual([
      "study:start",
      "topik:next-lesson",
      "topik:hungry",
      "bites:say-why",
    ])
    expect(keys({ open: true, lessons: false, done: true })).toEqual([
      "study:resume",
    ])
  })

  it("names only affordances the registry lists on the phone", () => {
    for (const { key: _key, ...stamp } of Object.values(HOME_OFFERS))
      expect(
        checkEvent(
          { ...stamp, kind: "offered", at: "2026-11-07T09:00:00.000Z" },
          PIPELINES
        )
      ).toMatchObject({ ok: true })
  })
})
