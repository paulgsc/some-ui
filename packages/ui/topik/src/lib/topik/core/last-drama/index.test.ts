import type { DramaState } from "@some-ui/makjang"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

import { lastDramaOf, NEXT_MAX, withReview } from "."

const lesson = workedLesson()

const ended = (
  route: Array<string>,
  first: Record<string, string>
): DramaState => ({ route, at: { kind: "end" }, first })

describe("lastDramaOf", () => {
  it("records the scenes reached and the first try at each choice, as text", () => {
    const record = lastDramaOf(
      lesson,
      ended(["b", "x"], { c1: "b", c2: "x" }),
      null,
      7
    )
    expect(record).toEqual({
      lessonId: lesson.id,
      level: lesson.level,
      title: "회장님 댁 거실",
      at: 7,
      scenes: [
        { id: "s1", place: "회장님 댁 거실", feeling: "tension" },
        { id: "s3", place: "회장님 댁 거실", feeling: "chill" },
        { id: "s4", place: "회장님 댁 거실", feeling: "warmth" },
      ],
      tries: [
        {
          prompt: expect.any(String),
          chosen: "응, 마실래.",
          answered: false,
        },
        {
          prompt: expect.any(String),
          chosen: "죄송합니다, 회장님. 제가 실수했습니다.",
          answered: true,
        },
      ],
    })
  })

  it("keeps a replay's earlier scenes and review, and replaces another drama's", () => {
    const first = withReview(
      lastDramaOf(lesson, ended(["b", "x"], { c1: "b", c2: "x" }), null, 1),
      { enjoyed: "loved" },
      2
    )
    // The replay takes another route; the first choice stays the outcome.
    const replay = lastDramaOf(
      lesson,
      ended(["a"], { c1: "b", c2: "x" }),
      first,
      3
    )
    expect(replay.scenes.map(({ id }) => id)).toEqual(["s1", "s2", "s3", "s4"])
    expect(replay.tries.map(({ answered }) => answered)).toEqual([false, true])
    expect(replay.review).toEqual({ enjoyed: "loved" })

    const other = lastDramaOf(
      lesson,
      ended(["a"], { c1: "a" }),
      { ...first, lessonId: "another" },
      4
    )
    expect(other.scenes.map(({ id }) => id)).toEqual(["s1", "s2"])
    expect(other.review).toBeUndefined()
  })
})

describe("withReview", () => {
  const record = lastDramaOf(lesson, ended(["a"], { c1: "a" }), null, 1)

  it("sets an answer, takes one back, and drops an empty review", () => {
    const given = withReview(
      record,
      { korean: "stretch", more: ["s2"], next: "more revenge" },
      2
    )
    expect(given).toMatchObject({
      at: 2,
      review: { korean: "stretch", more: ["s2"], next: "more revenge" },
    })
    const taken = withReview(
      given,
      { korean: undefined, more: [], next: "  " },
      3
    )
    expect(taken.review).toBeUndefined()
    expect(taken.at).toBe(3)
  })

  it("caps the free text", () => {
    const long = "가".repeat(NEXT_MAX + 5)
    expect(withReview(record, { next: long }, 2).review?.next).toHaveLength(
      NEXT_MAX
    )
  })
})
