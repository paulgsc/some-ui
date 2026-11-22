/**
 * @vitest-environment node
 *
 * C1119's algebra: only where a train stands has an urgency; now when
 * another train waits on it, whenever when the record says it can wait;
 * and the bar's blocker is the most urgent, the owner first at equal
 * urgency, then the longest waiting.
 */
import { describe, expect, it } from "vitest"

import { blockers, urgencyOf, waitingOn } from "@/lib/cooking/algebra"
import type { Train } from "@/lib/cooking/model"
import { trainsOf } from "@/lib/cooking/model"

import { FACTS, RUN } from "./fixtures"

const trains = trainsOf(RUN, FACTS)
const byId = (id: string): Train => {
  const t = trains.find((x) => x.id === id)
  if (t === undefined) throw new Error(id)
  return t
}

describe("the algebra", () => {
  it("makes a train another waits on urgent now", () => {
    expect(waitingOn(byId("G1"), trains).map((t) => t.id)).toEqual(["G3"])
    expect(urgencyOf(byId("G1"), trains)).toBe("now")
    expect(urgencyOf(byId("G2"), trains)).toBe("now")
  })

  it("leaves a step that can wait for whenever, and the rest for today", () => {
    expect(urgencyOf(byId("G7"), trains)).toBe("whenever")
    expect(urgencyOf(byId("G5"), trains)).toBe("today")
  })

  it("puts the owner's most urgent blocker first, then the others", () => {
    expect(
      blockers(trains).map((b) => [b.train.id, b.holder, b.urgency])
    ).toEqual([
      ["G2", "you", "now"],
      ["G1", "checks", "now"],
      ["G3", "checks", "today"],
      ["G5", "checks", "today"],
      ["G7", "you", "whenever"],
    ])
  })
})
