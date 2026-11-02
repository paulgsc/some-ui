/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import type { HomeKept, HomeReading, PhoneNote } from "@/lib/my-data/model"
import {
  GROWTH_WEEKS,
  growthOf,
  kindOf,
  mondayOf,
  overviewOf,
  readKept,
} from "@/lib/my-data/model"

const NOW = new Date("2026-11-02T12:00:00Z")

const KEPT: HomeKept = {
  kinds: [
    {
      of: "reflection",
      notes: 2,
      bytes: 2_000,
      setAside: 0,
      since: "2026-09-05T10:00:00.000Z",
    },
    {
      of: "studio",
      notes: 3,
      bytes: 9_000,
      setAside: 1,
      since: "2026-09-12T10:00:00.000Z",
    },
  ],
  weeks: [
    { week: "2026-10-19", notes: 3, bytes: 6_000 },
    { week: "2026-11-02", notes: 2, bytes: 5_000 },
  ],
  notes: null,
}
const READ: HomeReading = { kind: "read", kept: KEPT }

const note = (over: Partial<PhoneNote> & { id: string }): PhoneNote => ({
  of: "studio",
  at: "2026-11-01T09:00:00.000Z",
  bytes: 100,
  held: false,
  going: true,
  ...over,
})

describe("home's answer", () => {
  it("reads what home keeps, and says why when it can't", () => {
    expect(readKept({ status: 200, body: JSON.stringify(KEPT) })).toEqual(READ)
    expect(readKept({ status: 404, body: "" })).toEqual({ kind: "older" })
    expect(readKept({ status: 503, body: "" })).toEqual({
      kind: "unreachable",
    })
    expect(readKept({ status: 200, body: "{}" })).toEqual({
      kind: "unreachable",
    })
    const unknownKind = {
      ...KEPT,
      kinds: [{ ...KEPT.kinds[0], of: "diary" }],
    }
    expect(
      readKept({ status: 200, body: JSON.stringify(unknownKind) })
    ).toEqual({ kind: "unreachable" })
  })
})

describe("the overview", () => {
  it("counts a recording once: home's when home holds it, this phone's when not yet", () => {
    const view = overviewOf(
      READ,
      [
        note({ id: "held", held: true, bytes: 999 }),
        note({ id: "going", bytes: 300 }),
        note({ id: "only", going: false, of: "lens", bytes: 50 }),
      ],
      NOW
    )
    expect(view.homeBytes).toBe(11_000)
    expect(view.phoneBytes).toBe(350)
    expect(view.recordings).toBe(7)
    expect(view.where).toEqual({ home: 4, aside: 1, going: 1, phone: 1 })
    expect(
      view.kinds.map((k) => [k.of, k.notes, k.bytes, k.phoneOnly])
    ).toEqual([
      ["studio", 4, 9_300, false],
      ["reflection", 2, 2_000, false],
      ["lens", 1, 50, true],
    ])
  })

  it("keeps a kind's earliest recording as its since, wherever it is", () => {
    const view = overviewOf(
      READ,
      [note({ id: "old", at: "2026-08-01T09:00:00.000Z" })],
      NOW
    )
    expect(view.kinds[0]?.since).toBe("2026-08-01T09:00:00.000Z")
  })

  it("counts only this phone's side until home has answered", () => {
    for (const kind of [
      "reading",
      "unpaired",
      "unreachable",
      "older",
    ] as const) {
      const view = overviewOf({ kind }, [note({ id: "a", going: false })], NOW)
      expect(view.home).toBe(kind)
      expect(view.homeBytes).toBeNull()
      expect(view.growth).toEqual([])
      expect(view.recordings).toBe(1)
      expect(view.where).toEqual({ home: 0, aside: 0, going: 0, phone: 1 })
    }
  })
})

describe("how it grows on home", () => {
  it("weeks start on Monday, in UTC", () => {
    expect(mondayOf(new Date("2026-11-02T00:30:00Z"))).toBe("2026-11-02")
    expect(mondayOf(new Date("2026-11-08T23:59:00Z"))).toBe("2026-11-02")
    expect(mondayOf(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09")
  })

  it("adds up week by week, drawing a week nothing arrived level, up to this week", () => {
    expect(growthOf(KEPT.weeks, new Date("2026-11-10T12:00:00Z"))).toEqual([
      { week: "2026-10-19", bytes: 6_000 },
      { week: "2026-10-26", bytes: 6_000 },
      { week: "2026-11-02", bytes: 11_000 },
      { week: "2026-11-09", bytes: 11_000 },
    ])
    expect(growthOf([], NOW)).toEqual([])
  })

  it("shows the last quarter, the room before it carried in", () => {
    const weeks = [
      { week: "2026-01-05", notes: 1, bytes: 1_000 },
      { week: "2026-11-02", notes: 1, bytes: 10 },
    ]
    const growth = growthOf(weeks, NOW)
    expect(growth).toHaveLength(GROWTH_WEEKS)
    expect(growth[0]).toEqual({ week: "2026-08-10", bytes: 1_000 })
    expect(growth.at(-1)).toEqual({ week: "2026-11-02", bytes: 1_010 })
  })
})

describe("a kind's list", () => {
  const listed: HomeReading = {
    kind: "read",
    kept: {
      ...KEPT,
      notes: [
        {
          id: "on-home",
          recordedAt: "2026-10-20T09:00:00.000Z",
          storedAt: "2026-10-20T09:01:00.000Z",
          size: 3_000,
          setAsideAt: null,
        },
        {
          id: "aside",
          recordedAt: "2026-10-10T09:00:00.000Z",
          storedAt: "2026-10-10T09:01:00.000Z",
          size: 3_000,
          setAsideAt: "2026-10-11T09:00:00.000Z",
        },
      ],
    },
  }

  it("lists home's newest and this phone's, newest first, playable where the audio is here", () => {
    const view = kindOf(
      "studio",
      "studio",
      listed,
      [
        note({ id: "on-home", held: true, at: "2026-10-20T09:00:00.000Z" }),
        note({ id: "going", at: "2026-11-01T09:00:00.000Z" }),
        note({ id: "lens", of: "lens" }),
      ],
      NOW
    )
    expect(view.items).toEqual([
      {
        id: "going",
        at: "2026-11-01T09:00:00.000Z",
        bytes: 100,
        where: "going",
        playable: true,
      },
      {
        id: "on-home",
        at: "2026-10-20T09:00:00.000Z",
        bytes: 3_000,
        where: "home",
        playable: true,
      },
      {
        id: "aside",
        at: "2026-10-10T09:00:00.000Z",
        bytes: 3_000,
        where: "aside",
        playable: false,
      },
    ])
    expect(view.notes).toBe(4)
    expect(view.since).toBe("2026-09-12T10:00:00.000Z")
  })

  it("counts a recording home lists as home's, though this phone hasn't heard yet", () => {
    const view = kindOf(
      "studio",
      "studio",
      listed,
      [note({ id: "on-home", at: "2026-10-20T09:00:00.000Z" })],
      NOW
    )
    expect(view.notes).toBe(3)
    expect(view.items.map((item) => [item.id, item.where])).toEqual([
      ["on-home", "home"],
      ["aside", "aside"],
    ])
  })

  it("leaves out a list home gave for another kind", () => {
    const view = kindOf("studio", "lens", listed, [], NOW)
    expect(view.items).toEqual([])
    expect(view.notes).toBe(3)
  })

  it("is empty for a kind there is none of", () => {
    expect(kindOf("jobs", "jobs", READ, [], NOW)).toMatchObject({
      notes: 0,
      bytes: 0,
      since: null,
      items: [],
    })
  })
})
