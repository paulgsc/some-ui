import { checkEvent, PIPELINES } from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

import { HOME_OFFERS, studyCardOffers } from "@/lib/practice-home"

describe("what Practice Home offers", () => {
  it("offers Resume where a session is open, and TOPIK's two only while shown", () => {
    expect(
      studyCardOffers({ open: true, lessons: false }).map((offer) => offer.key)
    ).toEqual(["study:resume"])
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
