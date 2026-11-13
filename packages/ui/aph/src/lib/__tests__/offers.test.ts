import { APH_OFFERS, missedDayOffer, theirFigureOffer } from "@aph/lib/offers"
import { checkEvent, PIPELINES } from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

describe("what aph offers", () => {
  const offers = [
    ...Object.values(APH_OFFERS),
    missedDayOffer("2026-11-10"),
    theirFigureOffer("e1"),
  ]

  it("names only affordances the registry lists on the phone", () => {
    for (const { key: _key, ...stamp } of offers)
      expect(
        checkEvent(
          { ...stamp, kind: "offered", at: "2026-11-13T09:00:00.000Z" },
          PIPELINES
        )
      ).toMatchObject({ ok: true })
  })

  it("counts each day and entry as its own offer", () => {
    expect(new Set(offers.map((o) => o.key)).size).toBe(offers.length)
  })
})
