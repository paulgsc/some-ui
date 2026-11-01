import { reflectionsIndexStands } from "@topik/lib/topik/home-index"
import { describe, expect, it } from "vitest"

const INDEX = {
  schema: "some-ui.routine-index/1",
  routine: "reflections",
  asOf: "2026-10-31T14:01:00.000Z",
  validUntil: "2026-11-02T14:01:00.000Z",
  skipped: [],
  answered: {
    scenes: ["2026-10-29_reflection_2a4b6c01", "2026-10-30_stock_1"],
    dramas: [],
  },
  words: [],
  recent: [],
  unopened: { count: 0, lessons: [], opened: null },
  reflections: [],
  prompts: [],
}

const DRIVE = [
  {
    name: "TOPIK 2 · romance · At the café",
    description: "answers: 2026-10-29_reflection_2a4b6c01",
  },
  {
    name: "TOPIK 2 · thriller · The last train",
    description: "stock: 2026-10-30_stock_1",
  },
  { name: "TOPIK 3 · everyday · Starter", description: "" },
]

describe("reflectionsIndexStands", () => {
  it("stands before its validUntil, and names nothing when home counted every scene", () => {
    expect(
      reflectionsIndexStands(INDEX, "2026-11-01T16:00:00.000Z", DRIVE)
    ).toEqual({ stands: true, why: [], lacking: [] })
  })

  it("stands for good with no validUntil", () => {
    expect(
      reflectionsIndexStands(
        { ...INDEX, validUntil: null },
        "2027-01-01T00:00:00.000Z",
        DRIVE
      ).stands
    ).toBe(true)
  })

  it("does not stand from its validUntil on: home owes a newer one", () => {
    const standing = reflectionsIndexStands(
      INDEX,
      "2026-11-02T14:01:00.000Z",
      DRIVE
    )
    expect(standing.stands).toBe(false)
    expect(standing.why).toEqual([
      "Home's index held until 2026-11-02T14:01:00.000Z, and home hasn't put a newer one since.",
    ])
  })

  it("names the routine's Drive scenes home has not counted, once each, and only those", () => {
    const standing = reflectionsIndexStands(INDEX, "2026-11-01T16:00:00.000Z", [
      ...DRIVE,
      {
        name: "TOPIK 1 · everyday · Retired",
        description: "answers: 2026-10-01_morning_s-7f3a91",
      },
      {
        name: "TOPIK 1 · everyday · Retired",
        description: "answers: 2026-10-01_morning_s-7f3a91",
      },
      { name: "Level one", description: "a note of my own" },
    ])
    expect(standing).toEqual({
      stands: true,
      why: [],
      lacking: ["2026-10-01_morning_s-7f3a91"],
    })
  })

  it("does not stand when it does not read as a reflections index", () => {
    for (const index of [
      { ...INDEX, routine: "jobs" },
      { ...INDEX, validUntil: "soon" },
      { ...INDEX, answered: [] },
      null,
    ]) {
      expect(
        reflectionsIndexStands(index, "2026-11-01T16:00:00.000Z", DRIVE)
      ).toEqual({
        stands: false,
        why: ["Home's index doesn't read as a reflections index."],
        lacking: [],
      })
    }
  })

  it("does not stand when the run's own time doesn't read", () => {
    expect(reflectionsIndexStands(INDEX, "soon", DRIVE)).toEqual({
      stands: false,
      why: ["The run's own time doesn't read."],
      lacking: [],
    })
  })

  it("does not stand on a bare day, which Date.parse would read as midnight UTC", () => {
    for (const now of ["2026-11-01", "2026-11-01T09:00:00"]) {
      expect(reflectionsIndexStands(INDEX, now, DRIVE)).toEqual({
        stands: false,
        why: ["The run's own time doesn't read."],
        lacking: [],
      })
    }
  })
})
