import { findAffordance, PIPELINES } from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

import { interviewPlaceOf } from "@/lib/interview-week/places"

const WEEK = findAffordance(PIPELINES, "jobs", "interview-week", "apk")

describe("the interview week's places (WALK5, C861)", () => {
  it("names a place of the registry for every route it lists", () => {
    const places = new Set((WEEK?.places ?? []).map((p) => p.id))
    expect(WEEK?.routes.length).toBeGreaterThan(0)
    for (const route of WEEK?.routes ?? []) {
      const path = route
        .replace("$question", "walk-me-through")
        .replace("$card", "opening")
      const place = interviewPlaceOf(path)
      expect(place, route).not.toBeNull()
      expect(places.has(place ?? ""), route).toBe(true)
    }
  })

  it("tells a question's rungs and a script from their lists", () => {
    expect(interviewPlaceOf("/jobs/interview/")).toBe("way-in")
    expect(interviewPlaceOf("/jobs/interview/q/why-now/say")).toBe("say")
    expect(interviewPlaceOf("/jobs/interview/reads/opening")).toBe("read")
    expect(interviewPlaceOf("/jobs/interview/reads")).toBe("reads")
  })

  it("names no place off the week, or on a route it doesn't know", () => {
    expect(interviewPlaceOf("/jobs/record")).toBeNull()
    expect(interviewPlaceOf("/jobs/interview/q/why-now/later")).toBeNull()
    expect(interviewPlaceOf("/jobs/interview/elsewhere")).toBeNull()
  })
})
