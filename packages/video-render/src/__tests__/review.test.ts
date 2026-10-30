import { readReview, REVIEW_SCHEMA, reviewOf } from "@video-render/review"
import { describe, expect, it } from "vitest"

const TIMES = [
  { id: "a", cut: "c1", startMs: 0, durationMs: 2_000 },
  { id: "b", cut: null, startMs: 1_800, durationMs: 3_000 },
]

describe("a review render's review.json", () => {
  it("names the revision rendered, and reads back as written", () => {
    const review = reviewOf(
      { revisions: [{ rev: 3, author: "claude", message: "m", at: "x" }] },
      TIMES
    )
    expect(review).toEqual({ schema: REVIEW_SCHEMA, rev: 3, shotTimes: TIMES })
    expect(readReview(JSON.stringify(review))).toEqual({
      ok: true,
      value: review,
    })
  })

  it("is not written for a cut list that names no revision", () => {
    expect(reviewOf({ revisions: [] }, TIMES)).toBeNull()
  })

  it("names what is wrong with a file that isn't one", () => {
    expect(readReview("{")).toEqual({ ok: false, problems: ["not JSON"] })
    expect(readReview(JSON.stringify({ schema: REVIEW_SCHEMA })).ok).toBe(false)
  })
})
