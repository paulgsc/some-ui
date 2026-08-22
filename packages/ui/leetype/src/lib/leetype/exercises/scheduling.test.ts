import { describe, expect, it } from "vitest"

import { createExerciseSchedule, takeScheduledExercise } from "./scheduling"

function take(
  ids: ReadonlyArray<string>,
  seed: number,
  count: number
): Array<string> {
  let schedule = createExerciseSchedule(ids, seed)
  return Array.from({ length: count }, () => {
    const next = takeScheduledExercise(ids, schedule)
    schedule = next.schedule
    return next.exerciseId
  })
}

describe("cyclic exercise schedule", () => {
  it("visits every eligible exercise exactly once per cycle", () => {
    const ids = ["a", "b", "c", "d"]
    const order = take(ids, 42, ids.length * 3)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      expect(
        order.slice(cycle * ids.length, (cycle + 1) * ids.length).sort()
      ).toEqual(ids)
    }
  })

  it("is reproducible from the session seed", () => {
    expect(take(["a", "b", "c"], 1729, 20)).toEqual(
      take(["a", "b", "c"], 1729, 20)
    )
  })

  it("does not repeat at a cycle boundary when another choice exists", () => {
    const ids = ["a", "b", "c"]
    const order = take(ids, 7, 30)

    for (
      let boundary = ids.length;
      boundary < order.length;
      boundary += ids.length
    ) {
      expect(order[boundary]).not.toBe(order[boundary - 1])
    }
  })

  it("cycles a one-exercise corpus safely", () => {
    expect(take(["only"], 0, 5)).toEqual([
      "only",
      "only",
      "only",
      "only",
      "only",
    ])
  })

  it("rejects an empty eligible corpus", () => {
    expect(() => createExerciseSchedule([], 1)).toThrow(
      "Cannot schedule an empty exercise corpus."
    )
  })
})
