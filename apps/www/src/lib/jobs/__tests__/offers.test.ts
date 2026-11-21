import {
  checkEvent,
  findAffordance,
  PIPELINES,
  stepPlace,
} from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

import { EMPTY, step } from "@/lib/jobs/model"
import {
  PICK_PLACES,
  pickAffordanceOf,
  pickOffer,
  pickPlaceAt,
  pickPlaces,
  RECORD_PLACES,
} from "@/lib/jobs/offers"
import { steps } from "@/lib/jobs/words"

import { digest, OPENED_AT } from "./fixture"

describe("the Jobs wing in the vocabulary of use (WALK5, C861)", () => {
  it("names a pick's steps as the registry's places, one per step of the bar", () => {
    for (const affordance of ["todays-pick", "other-pick"] as const) {
      const ids = findAffordance(
        PIPELINES,
        "jobs",
        affordance,
        "apk"
      )?.places?.map((p) => p.id)
      expect(ids).toEqual([...PICK_PLACES])
    }
    expect(PICK_PLACES.length).toBe(steps.length)
    expect(pickPlaceAt(0)).toBe("read")
    expect(pickPlaceAt(steps.length)).toBeNull()
  })

  it("sends only events the registry accepts, from a pick's steps and the Record tab", () => {
    const at = "2026-11-21T09:00:00.000Z"
    for (const of of [pickPlaces("todays-pick"), pickPlaces("other-pick")]) {
      const first = stepPlace(of, null, "read", at)
      const left = stepPlace(of, first.open, null, at)
      for (const event of [...first.events, ...left.events]) {
        expect(checkEvent(event, PIPELINES).ok).toBe(true)
      }
    }
    const record = stepPlace(RECORD_PLACES, null, "record", at)
    for (const event of stepPlace(RECORD_PLACES, record.open, null, at)
      .events) {
      expect(checkEvent(event, PIPELINES).ok).toBe(true)
    }
  })

  it("offers the pick Today opens on as today's, and every other as another", () => {
    const d = digest("2026-10-18")
    const state = step(EMPTY, { type: "opened", digest: d, at: OPENED_AT })
    const [first, second] = d.picks
    expect(pickAffordanceOf(state, d.day, d.day, first.id)).toBe("todays-pick")
    expect(pickAffordanceOf(state, d.day, d.day, second.id)).toBe("other-pick")
    expect(pickOffer("other-pick", d.day, second.id).key).toBe(
      `jobs:other-pick:${d.day}:${second.id}`
    )
  })
})
