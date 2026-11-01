import { describe, expect, it } from "vitest"

import type { Reflection } from "@/lib/session-reflection/policy"
import {
  admit,
  beyondOffline,
  bySession,
  describeAge,
  fromLegacy,
  inView,
  isStale,
  parseReflection,
  STALE_AFTER_MS,
  withAnswers,
} from "@/lib/session-reflection/policy"

const DAY = 24 * 60 * 60_000
const NOW = Date.parse("2026-10-11T12:00:00Z")

function note(id: string, sessionId: string, daysAgo = 0): Reflection {
  return {
    id,
    sessionId,
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    atMs: 1000,
    body: { kind: "text", text: id },
  }
}

describe("admit", () => {
  it("puts a new one first", () => {
    expect(admit([note("old", "s1")], note("new", "s2"))).toMatchObject([
      { id: "new" },
      { id: "old" },
    ])
  })

  it("replaces the one with the same id", () => {
    const kept = [note("a", "s1"), note("b", "s2")]
    const edited: Reflection = {
      ...note("a", "s1"),
      body: { kind: "text", text: "x" },
    }

    expect(admit(kept, edited)).toMatchObject([
      { id: "a", body: { text: "x" } },
      { id: "b" },
    ])
  })
})

describe("beyondOffline (LA16)", () => {
  const kept = [
    note("new", "s1", 0),
    note("mid", "s1", 1),
    note("old", "s2", 2),
  ]

  it("names only the ones past the newest that home holds", () => {
    expect(beyondOffline(kept, new Set(["new", "mid", "old"]), 2)).toEqual([
      "old",
    ])
    expect(beyondOffline(kept, new Set(["new", "mid", "old"]), 1)).toEqual([
      "mid",
      "old",
    ])
  })

  it("never names one home does not hold, however far past the set", () => {
    expect(beyondOffline(kept, new Set(["new"]), 0)).toEqual(["new"])
    expect(beyondOffline(kept, new Set(), 0)).toEqual([])
    expect(beyondOffline(kept, new Set(["mid"]), 2)).toEqual([])
  })

  it("orders by when each was said, not by where it sits in the list", () => {
    const shuffled = [
      note("old", "s2", 2),
      note("new", "s1", 0),
      note("mid", "s1", 1),
    ]
    expect(beyondOffline(shuffled, new Set(["old", "new"]), 2)).toEqual(["old"])
  })
})

describe("withAnswers", () => {
  const made = { id: "new", createdAt: new Date(NOW).toISOString(), atMs: 5 }

  it("keeps one set per session, changed in place", () => {
    const first = withAnswers([], "s1", { difficulty: "too-hard" }, made)
    expect(first).toMatchObject([
      { id: "new", body: { answers: { difficulty: "too-hard" } } },
    ])
    const second = withAnswers(
      first,
      "s1",
      { difficulty: "right", worthwhile: "yes" },
      { ...made, id: "other" }
    )
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      id: "new",
      body: { answers: { difficulty: "right", worthwhile: "yes" } },
    })
  })

  it("lets the set go once every answer is cleared, and drops unknown answers", () => {
    const first = withAnswers([], "s1", { enthusiasm: "keen" }, made)
    expect(withAnswers(first, "s1", {}, made)).toEqual([])
    expect(withAnswers([], "s1", { enthusiasm: "sleepy" }, made)).toEqual([])
  })
})

describe("staleness", () => {
  it("turns stale at a week", () => {
    expect(isStale(note("a", "s1", 6.9), NOW)).toBe(false)
    expect(isStale(note("a", "s1", 7), NOW)).toBe(true)
  })

  it("says an age in days", () => {
    expect(describeAge(0)).toBe("today")
    expect(describeAge(DAY)).toBe("1 day")
    expect(describeAge(9.5 * DAY)).toBe("9 days")
  })
})

describe("bySession", () => {
  it("groups per session, the longest-waiting first, each in the order said", () => {
    const groups = bySession(
      [note("b2", "s2", 1), note("a1", "s1", 2), note("b1", "s2", 8)],
      NOW
    )

    expect(groups.map((g) => g.sessionId)).toEqual(["s2", "s1"])
    expect(groups[0]).toMatchObject({ oldestMs: 8 * DAY, stale: true })
    expect(groups[0]?.reflections.map((r) => r.id)).toEqual(["b1", "b2"])
    expect(groups[1]?.stale).toBe(false)
  })
})

describe("parseReflection", () => {
  it("reads what was written and refuses anything else", () => {
    const voice: Reflection = {
      ...note("v", "s1"),
      body: {
        kind: "voice",
        durationMs: 4000,
        mimeType: "audio/webm",
        bytes: 9,
      },
    }
    expect(parseReflection(JSON.parse(JSON.stringify(voice)))).toEqual(voice)
    expect(
      parseReflection({ ...note("t", "s1"), body: { kind: "text", text: " " } })
    ).toBeNull()
    expect(
      parseReflection({ ...note("t", "s1"), createdAt: "never" })
    ).toBeNull()
    expect(parseReflection({ ...note("t", "s1"), atMs: "1" })).toBeNull()
  })

  it("reads a spoken one out of view as kept, and out of its session's view (D2, D3)", () => {
    const body = {
      kind: "voice",
      durationMs: 4000,
      mimeType: "audio/webm",
      bytes: 9,
    } as const
    const aside = parseReflection({
      ...note("v", "s1"),
      body: { ...body, standing: "set-aside" },
    })
    expect(aside?.body).toEqual({ ...body, standing: "set-aside" })
    expect(aside && inView(aside)).toBe(false)
    // An unknown standing reads as in view: nothing is hidden by a typo.
    const odd = parseReflection({
      ...note("v", "s1"),
      body: { ...body, standing: "gone" },
    })
    expect(odd && inView(odd)).toBe(true)
    expect(inView(note("t", "s1"))).toBe(true)
  })
})

describe("fromLegacy", () => {
  it("moves each old set of answers, dated stale, and skips what no question offers", () => {
    const staleAt = new Date(NOW - STALE_AFTER_MS).toISOString()
    expect(
      fromLegacy(
        [
          { id: "s1", answers: { worthwhile: "yes", pace: 1 } },
          { id: "s2", answers: { worthwhile: "maybe" } },
          "junk",
        ],
        staleAt
      )
    ).toEqual([
      {
        id: "legacy-s1",
        sessionId: "s1",
        createdAt: staleAt,
        atMs: null,
        body: { kind: "answers", answers: { worthwhile: "yes" } },
      },
    ])
  })
})
