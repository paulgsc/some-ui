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
import { trainsOf } from "@/lib/cooking/model"

import { FACTS, RUN, trainOf } from "./fixtures"

const trains = trainsOf(RUN, FACTS)

describe("the algebra", () => {
  it("makes a train another waits on urgent now", () => {
    expect(waitingOn(trainOf("G1"), trains).map((t) => t.id)).toEqual(["G3"])
    expect(urgencyOf(trainOf("G1"), trains)).toBe("now")
    expect(urgencyOf(trainOf("G2"), trains)).toBe("now")
  })

  it("leaves a step that can wait for whenever, and the rest for today", () => {
    expect(urgencyOf(trainOf("G7"), trains)).toBe("whenever")
    expect(urgencyOf(trainOf("G5"), trains)).toBe("today")
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
