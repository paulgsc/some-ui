import { checkEvent, isEventShape } from "@engagement/lib/check-event"
import type { VisitEnding } from "@engagement/lib/events"
import { endingOf, VISIT_ENDINGS } from "@engagement/lib/events"
import { PIPELINES } from "@engagement/lib/pipelines"
import { describe, expect, it } from "vitest"

const AT = "2026-11-03T08:15:00.000Z"
const EARLIER = "2026-11-03T08:10:00Z"

const base = {
  pipeline: "topik",
  affordance: "routine-lens",
  surface: "apk",
  at: AT,
} as const

describe("how a visit ends", () => {
  it("ends a visit with the first ending that applies", () => {
    expect(endingOf(new Set<VisitEnding>(["left-the-app", "put-away"]))).toBe(
      "put-away"
    )
    expect(endingOf(new Set<VisitEnding>(["moved-on", "took-another"]))).toBe(
      "took-another"
    )
    expect(endingOf(new Set())).toBeUndefined()
    for (const { id } of VISIT_ENDINGS) expect(endingOf(new Set([id]))).toBe(id)
  })
})

describe("checkEvent: what an event may carry", () => {
  it.each([
    { ...base, kind: "offered" },
    { ...base, kind: "taken" },
    {
      ...base,
      pipeline: "study",
      affordance: "resume",
      surface: "web",
      kind: "taken",
    },
    { ...base, kind: "passed-over", offeredAt: EARLIER, ending: "moved-on" },
    { ...base, kind: "left", startedAt: EARLIER, place: "your-turn" },
    {
      ...base,
      affordance: "sentence-feedback",
      kind: "said",
      answer: "too-easy",
    },
  ])("keeps a $kind of the registry's", (event) => {
    expect(checkEvent(event, PIPELINES)).toEqual({ ok: true, event })
  })

  it.each([
    ["words", { ...base, kind: "taken", text: "안녕하세요" }, "text"],
    ["audio", { ...base, kind: "taken", audio: "UklGRg==" }, "audio"],
    ["item content", { ...base, kind: "offered", item: "scene 3" }, "item"],
    [
      "a place that is free text",
      {
        ...base,
        kind: "left",
        startedAt: EARLIER,
        place: "line 4: 감사합니다",
      },
      "place",
    ],
    [
      "an answer that is free text",
      {
        ...base,
        affordance: "sentence-feedback",
        kind: "said",
        answer: "the sentences were boring",
      },
      "answer",
    ],
    [
      "an ending off the list",
      { ...base, kind: "passed-over", offeredAt: EARLIER, ending: "bored" },
      "ending",
    ],
    ["came back", { ...base, kind: "came-back" }, "kind"],
    [
      "an affordance on the wrong surface",
      { ...base, surface: "web", kind: "taken" },
      "affordance",
    ],
    [
      "an affordance the registry lacks",
      { ...base, affordance: "flashcards", kind: "taken" },
      "affordance",
    ],
    [
      "a kind its affordance does not emit",
      { ...base, kind: "said", answer: "too-easy" },
      "kind",
    ],
    [
      "a start after its end",
      {
        ...base,
        kind: "left",
        startedAt: "2026-11-03T09:00:00Z",
        place: "echo",
      },
      "startedAt",
    ],
    ["a time that is not UTC", { ...base, at: "Nov 3", kind: "taken" }, "at"],
    [
      "a missing field",
      { ...base, kind: "passed-over", ending: "moved-on" },
      "offeredAt",
    ],
  ])("refuses %s", (_, event, field) => {
    const checked = checkEvent(event, PIPELINES)
    expect(checked.ok).toBe(false)
    if (!checked.ok)
      expect(checked.problems.some((p) => p.includes(field))).toBe(true)
  })

  it("refuses what is not an event at all", () => {
    expect(checkEvent(null, PIPELINES).ok).toBe(false)
    expect(checkEvent(["taken"], PIPELINES).ok).toBe(false)
  })
})

describe("isEventShape: an event read back, with no registry", () => {
  const taken = { kind: "taken", ...base } as const
  it("takes an event of any affordance id, and nothing beyond its kind's shape", () => {
    expect(isEventShape({ ...taken, affordance: "since-retired" })).toBe(true)
    expect(isEventShape({ ...taken, words: "said aloud" })).toBe(false)
    expect(isEventShape({ ...taken, affordance: "The lens" })).toBe(false)
    expect(isEventShape({ ...taken, surface: "ios" })).toBe(false)
  })

  it("takes only instants that name a real time, as home does", () => {
    for (const at of ["2026-11-03T24:00:00Z", "2026-02-30T00:00:00Z"]) {
      expect(isEventShape({ ...taken, at })).toBe(false)
      expect(checkEvent({ ...taken, at }, PIPELINES).ok).toBe(false)
    }
    expect(isEventShape({ ...taken, at: EARLIER })).toBe(true)
  })
})
