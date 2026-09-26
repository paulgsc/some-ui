import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { describe, expect, it } from "vitest"

import { isBlank, MAX_STUCK_CANDIDATES, stuckCandidates } from "."

describe("stuckCandidates", () => {
  it("offers the missed probes, in lesson order, with what they were about", () => {
    expect(
      stuckCandidates(FIXTURE_BATCHES, {
        2: ["c2-promise-forms"],
        1: ["c1-request-forms", "gone"],
      })
    ).toEqual([
      {
        batchId: 1,
        probeId: "c1-request-forms",
        prompt: "Which is NOT a valid transformation of this request?",
        source: "아이스 아메리카노 한 잔 주세요.",
      },
      {
        batchId: 2,
        probeId: "c2-promise-forms",
        prompt: "Which is NOT a valid transformation?",
        source: "카드로 할게요.",
      },
    ])
  })

  it("keeps the most recent misses a dock can hold", () => {
    const every = Object.fromEntries(
      FIXTURE_BATCHES.map((batch) => [
        batch.id,
        (batch.probes ?? []).map((probe) => probe.id),
      ])
    )
    const offered = stuckCandidates(FIXTURE_BATCHES, every)
    expect(offered).toHaveLength(MAX_STUCK_CANDIDATES)
    expect(offered.at(-1)?.probeId).toBe("c2-build-past")
  })

  it("offers nothing when nothing was missed", () => {
    expect(stuckCandidates(FIXTURE_BATCHES, {})).toEqual([])
  })
})

describe("isBlank", () => {
  it("is a skip only when nothing at all was answered", () => {
    expect(isBlank({ stuck: [], becoming: " " })).toBe(true)
    expect(isBlank({ stuck: [], difficulty: "right" })).toBe(false)
    expect(isBlank({ stuck: [], enthusiasm: "drained" })).toBe(false)
    expect(isBlank({ stuck: [{ batchId: 1, probeId: "p" }] })).toBe(false)
  })
})
