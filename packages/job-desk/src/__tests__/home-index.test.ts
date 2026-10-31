import { indexStands, MAILBOX_OPENED } from "@job-desk/home-index"
import { describe, expect, it } from "vitest"

/** Home's index as paulgsc/server `mailbox::index` writes it, trimmed to what the run reads. */
function index(overrides: Record<string, unknown> = {}): unknown {
  return {
    schema: "some-ui.routine-index/1",
    routine: "jobs",
    day: "2026-10-31",
    validThrough: "2026-11-02",
    asOf: "2026-10-31T15:05:00.000Z",
    from: {
      digests: ["digest-2026-10-20.json", "digest-2026-10-31.json"],
      decisions: ["decisions-2026-10-20.json", "decisions-2026-10-30.json"],
      scout: ["scouts-20261021T101500.json"],
      backfill: ["decisions-2026-10-20.json", "scouts-20261021T101500.json"],
    },
    skipped: [],
    queue: { open: [], lapsed: [], free: { software: 3, adjacent: 2 } },
    new: { decisions: [], scout: [] },
    notes: [],
    picked: [],
    ...overrides,
  }
}

const DRIVE = {
  brief: ["digest-2026-10-20.json", "digest-2026-10-31.json", "notes.txt"],
  decisions: ["decisions-2026-10-20.json", "decisions-2026-10-30.json"],
  scout: ["scouts-20261021T101500.json"],
}

const NOTHING = { digests: [], backfill: [], later: [] }

describe("whether home's index stands (ROUTINE.md §0.5)", () => {
  it("stands from the day home computed it through validThrough", () => {
    for (const today of ["2026-10-31", "2026-11-01", "2026-11-02"]) {
      expect([today, indexStands(index(), today, DRIVE)]).toEqual([
        today,
        { stands: true, why: [], ...NOTHING },
      ])
    }
  })

  it("does not stand once a pick has lapsed, nor before the day it was computed", () => {
    expect(indexStands(index(), "2026-11-03", DRIVE)).toEqual({
      stands: false,
      why: ["Home's index holds through 2026-11-02; a pick has lapsed since."],
      ...NOTHING,
    })
    expect(indexStands(index(), "2026-10-30", DRIVE).stands).toBe(false)
  })

  it("stands on any later day when nothing can lapse", () => {
    const quiet = index({ validThrough: null })
    for (const today of ["2026-10-31", "2026-11-15", "2027-01-01"]) {
      expect(indexStands(quiet, today, DRIVE).stands).toBe(true)
    }
  })

  it("does not stand while Drive holds a file it lacks, and says what to put back", () => {
    const drive = {
      brief: [...DRIVE.brief, "digest-2026-10-19.json"],
      decisions: [
        ...DRIVE.decisions,
        "decisions-2026-10-18.json",
        "decisions-2026-10-22-2.json",
        "decisions-2026-10-27.json",
      ],
      scout: [...DRIVE.scout, "scouts-20261023T000000.json"],
    }
    expect(indexStands(index(), "2026-11-01", drive)).toEqual({
      stands: false,
      why: ["Home hasn't counted 5 file(s) Drive holds."],
      digests: ["digest-2026-10-19.json"],
      backfill: ["decisions-2026-10-18.json", "decisions-2026-10-22-2.json"],
      later: ["decisions-2026-10-27.json", "scouts-20261023T000000.json"],
    })
    expect(MAILBOX_OPENED).toBe("2026-10-23")
  })

  it("puts nothing back for an index that doesn't read", () => {
    for (const bad of [
      null,
      index({ routine: "reflections" }),
      index({ validThrough: "soon" }),
      index({ from: { digests: [], decisions: [], scout: [] } }),
    ]) {
      expect(indexStands(bad, "2026-11-01", DRIVE)).toEqual({
        stands: false,
        why: ["Home's index doesn't read as a Jobs index."],
        ...NOTHING,
      })
    }
  })
})
