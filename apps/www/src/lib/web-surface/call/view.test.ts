import { PIPELINES } from "@some-ui/engagement"
import {
  CALL_INDEX_SCHEMA,
  CALL_VERSION,
  essayIntro,
  reportPages,
  reportProblems,
  reportWeek,
  sampleCallWeek,
  sampleEssay,
  sampleReport,
} from "@some-ui/video-render"
import type {
  CallIndex,
  CallWeek,
  EngagementReport,
  Essay,
} from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { essayAt, essayStageOf } from "./essay-view"
import { reportAt, reportStageOf } from "./report-view"
import { callAt, stageOf, weekFrom } from "./view"

const week = (): CallWeek => {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("the call's stage", () => {
  it("shows the scene named, with the item it draws", () => {
    const at = callAt(week(), "asks-2")
    expect(at.scene.id).toBe("asks-2")
    expect(at.view.section).toBe("asks")
    expect("item" in at.view && at.view.item.id).toBe("talk-d1")
    // The close and the brand outro follow it.
    expect(at.index).toBe(at.scenes.length - 3)
  })

  it("draws the locked intro and a chapter from the week, in its shape", () => {
    const intro = callAt(week(), "intro").view
    expect(intro.section === "intro" && intro.rows.map((r) => r.label)).toEqual(
      ["Written by", "Drawn by", "Voices", "Calls inside"]
    )
    expect(callAt(week(), "chapter-done").view).toEqual({
      section: "chapter",
      title: "What landed",
      items: week().done.length,
    })
    expect(callAt(week(), "brand-out").view).toEqual({ section: "brand-out" })
  })

  it("opens on the first scene when the id names none", () => {
    for (const id of [undefined, "", "asks-9"]) {
      const at = callAt(week(), id)
      expect([at.index, at.scene.id, at.view.section]).toEqual([
        0,
        "intro",
        "intro",
      ])
    }
  })
})

describe("the week the stage asks for", () => {
  const index: CallIndex = {
    schema: CALL_INDEX_SCHEMA,
    keep: 8,
    weeks: [
      { from: "2026-11-06", to: "2026-11-12" },
      { from: "2026-10-30", to: "2026-11-05" },
    ],
  }

  it("is the one named, else the newest, and says when the one named isn't kept", () => {
    expect(weekFrom(index, "2026-10-30")).toEqual({
      from: "2026-10-30",
      missing: false,
    })
    expect(weekFrom(index, undefined)).toEqual({
      from: "2026-11-06",
      missing: false,
    })
    expect(weekFrom(index, "1999-01-01")).toEqual({
      from: "2026-11-06",
      missing: true,
    })
  })

  it("is none for the sample, before the index is read, or when it keeps none", () => {
    expect(weekFrom(index, "sample")).toEqual({ from: null, missing: false })
    expect(weekFrom(undefined, "2026-10-30")).toEqual({
      from: null,
      missing: false,
    })
    expect(weekFrom({ ...index, weeks: [] }, undefined)).toEqual({
      from: null,
      missing: false,
    })
  })
})

describe("what the stage draws", () => {
  const sample = sampleCallWeek()
  const index: CallIndex = {
    schema: CALL_INDEX_SCHEMA,
    keep: 8,
    weeks: [{ from: "2026-10-30", to: "2026-11-05" }],
  }
  const read = <T>(
    data: T | undefined,
    pending = false
  ): { data: T | undefined; pending: boolean } => ({ data, pending })
  const base = {
    reads: true,
    record: false,
    from: undefined,
    index: read(index),
    week: read(week()),
    sample,
  }

  it("waits for the live week, and draws it once read", () => {
    expect(
      stageOf({ ...base, index: read<CallIndex>(undefined, true) }).kind
    ).toBe("waiting")
    expect(
      stageOf({ ...base, week: read<CallWeek>(undefined, true) }).kind
    ).toBe("waiting")
    expect(stageOf(base)).toMatchObject({
      kind: "show",
      sample: false,
      unread: false,
    })
  })

  it("says so when the live week couldn't be read, and never records the sample in its place", () => {
    const failed = { ...base, week: read<CallWeek>(undefined) }
    expect(stageOf(failed)).toMatchObject({
      kind: "show",
      sample: true,
      unread: true,
    })
    expect(stageOf({ ...failed, record: true }).kind).toBe("blank")
    const broken = {
      ...base,
      week: read({ ...week(), week: { from: "2026-11-05", to: "2026-10-30" } }),
    }
    expect(stageOf(broken)).toMatchObject({
      kind: "show",
      sample: true,
      unread: true,
      problems: ["week: it ends before it starts"],
    })
  })

  it("refuses a week newer than it knows: on record, saying why; off record, drawing the sample (VS1)", () => {
    const newer = {
      ...base,
      record: true,
      week: read({
        ...week(),
        template: { ...week().template, version: CALL_VERSION + 1 },
      }),
    }
    const state = stageOf(newer)
    expect(state.kind).toBe("none")
    expect(state.kind === "none" && state.problems.join("\n")).toContain(
      `up to version ${String(CALL_VERSION)}`
    )
    // Off record, a person looking gets the sample, never the newer week in
    // an older look, and is told why.
    expect(stageOf({ ...newer, record: false })).toMatchObject({
      kind: "show",
      sample: true,
      problems: [
        expect.stringContaining(`up to version ${String(CALL_VERSION)}`),
      ],
    })
  })

  it("draws the sample, unread or not, where nothing live is asked for", () => {
    expect(
      stageOf({ ...base, reads: false, week: read<CallWeek>(undefined) })
    ).toMatchObject({
      kind: "show",
      sample: true,
      unread: false,
    })
    expect(stageOf({ ...base, from: "sample", record: true })).toMatchObject({
      kind: "show",
      sample: true,
      unread: false,
    })
    expect(
      stageOf({
        ...base,
        index: read({ ...index, weeks: [] }),
        week: read<CallWeek>(undefined),
      })
    ).toMatchObject({ kind: "show", sample: true, unread: false })
  })
})

const essay = (): Essay => {
  const parsed = sampleEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("the essay's stage", () => {
  it("draws each scene with its ticket, and each deep dive by its place in the ticket's", () => {
    const answer = essayAt(essay(), "answer-1").view
    expect(answer.section === "answer" && answer.ticket.id).toBe("QM-311")
    const dive = essayAt(essay(), "dive-4").view
    expect(
      dive.section === "dive" && [dive.ticket.id, dive.n, dive.dive.title]
    ).toEqual(["QM-312", 2, "What `clear` and `push_str` do to the bytes"])
  })

  it("numbers each ticket's chapter", () => {
    expect(essayAt(essay(), "chapter-question-2").view).toEqual({
      section: "chapter",
      title: "QM-312: Reuse the read buffer without losing the fields",
      ticket: { n: 2, of: 3 },
    })
  })

  it("opens on the first scene when the id names none", () => {
    expect(essayAt(essay(), "nope").scene.id).toBe("intro")
    expect(essayAt(essay(), undefined).index).toBe(0)
  })
  it("says under the chart each decay, then each fading, as the record names them (RR19)", () => {
    const weeks = essayAt(essay(), "weeks").view
    if (weeks.section !== "weeks") throw new Error("no chart")
    expect(weeks.recheck).toBe(true)
    expect(weeks.notes).toEqual([
      {
        kind: "decayed",
        name: "Borrows into a reused buffer",
        week: "2026-w46",
        below: "2026-w41",
      },
      { kind: "faded", name: "Allocation on the hot path", since: "2026-w44" },
      { kind: "faded", name: "Lifetime elision", since: "2026-w45" },
    ])
    expect(
      weeks.rows.map((row) => row.cells.map((cell) => cell.kind))
    ).toContainEqual(["level", "unmet", "faded", "faded", "faded", "level"])
  })
})

describe("the essay the stage draws (RR16)", () => {
  const read = (
    data: unknown,
    more: { pending?: boolean; failed?: boolean } = {}
  ): { data: unknown; pending: boolean; failed: boolean } => ({
    data,
    pending: more.pending ?? false,
    failed: more.failed ?? false,
  })
  const sample = sampleEssay()

  it("is the sample, voiced as one, with no week or with `sample`", () => {
    for (const week of [undefined, "sample"]) {
      const state = essayStageOf({ week, read: read(undefined), sample })
      expect(
        state.kind === "show" && [state.essay.week.id, state.voicing]
      ).toEqual(["2026-w46", "sample"])
    }
    expect(essayAt(essay(), "intro", "sample").view).toEqual({
      section: "intro",
      rows: essayIntro(essay(), "sample").rows,
    })
  })

  it("is the named week's essay as read, in the owner's voice", () => {
    const state = essayStageOf({
      week: "2026-w46",
      read: read(essay()),
      sample,
    })
    expect(state.kind === "show" && state.voicing).toBe("owner")
    expect(
      essayStageOf({
        week: "2026-w46",
        read: read(undefined, { pending: true }),
        sample,
      })
    ).toEqual({ kind: "waiting" })
  })

  it("is never the sample in place of a week it can't read", () => {
    expect(
      essayStageOf({
        week: "2026-w46",
        read: read(undefined, { failed: true }),
        sample,
      })
    ).toEqual({
      kind: "none",
      problems: ["No essay of 2026-w46 could be read"],
    })
    expect(
      essayStageOf({ week: "2026-w47", read: read(essay()), sample })
    ).toEqual({
      kind: "none",
      problems: ["The essay read is 2026-w46's, not 2026-w47's"],
    })
    const broken = essayStageOf({
      week: "2026-w46",
      read: read({ ...essay(), tickets: [] }),
      sample,
    })
    expect(broken.kind === "none" && broken.problems.length).toBeGreaterThan(0)
  })
})

const sampleReportOf = (): EngagementReport => {
  const parsed = sampleReport()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

const NOT_READ: {
  data: unknown
  pending: boolean
  failed: boolean
} = { data: undefined, pending: false, failed: false }

describe("the report's stage", () => {
  it("shows the table named, and the first scene for a name it lacks", () => {
    const at = reportAt(sampleReportOf(), "pipeline-2", false)
    expect(at.view.section === "pipeline" && at.view.page.pipeline).toBe(
      "Rust Rounds"
    )
    expect(reportAt(sampleReportOf(), "pipeline-99", false).scene.id).toBe(
      "intro"
    )
  })

  it("draws the overview, a wing's chapter and what moved from the report", () => {
    expect(reportAt(sampleReportOf(), "overview", false).view).toEqual({
      section: "overview",
      wings: [
        { name: "Practice", lines: 6, taken: 3 },
        { name: "Studio", lines: 2, taken: 2 },
        { name: "Operate", lines: 1, taken: 0 },
        { name: "Self and work", lines: 1, taken: 1 },
      ],
    })
    expect(reportAt(sampleReportOf(), "chapter-wing-1", false).view).toEqual({
      section: "chapter",
      title: "Practice",
      pipelines: 2,
    })
    const moved = reportAt(sampleReportOf(), "moved", false).view
    expect(moved.section === "moved" && moved.line?.name).toBe("Next lesson")
  })

  it("says a sample is one in its locked intro", () => {
    const intro = reportAt(sampleReportOf(), "intro", true).view
    expect(intro.section === "intro" && intro.rows[0]?.says).toBe(
      "Code, from made-up records: this is the template's sample"
    )
  })
})

describe("what the report's stage draws from its read", () => {
  const read = (data: unknown): typeof NOT_READ => ({
    data,
    pending: false,
    failed: false,
  })

  it("draws the sample with no week, or for a viewer whatever week is named", () => {
    for (const [week, viewer] of [
      [undefined, false],
      ["sample", false],
      ["2026-W46", true],
    ] as const) {
      const state = reportStageOf({
        week,
        viewer,
        read: read(sampleReportOf()),
        sample: sampleReport(),
      })
      expect(state.kind === "show" && state.sample).toBe(true)
    }
  })

  it("draws the week named as read, and never the sample in its place", () => {
    const shown = reportStageOf({
      week: "2026-W46",
      viewer: false,
      read: read(sampleReportOf()),
      sample: sampleReport(),
    })
    expect(shown.kind === "show" && shown.sample).toBe(false)
    expect(
      reportStageOf({
        week: "2026-W47",
        viewer: false,
        read: read(sampleReportOf()),
        sample: sampleReport(),
      })
    ).toEqual({
      kind: "none",
      problems: ["The report read is 2026-W46's, not 2026-W47's"],
    })
    expect(
      reportStageOf({
        week: "2026-W46",
        viewer: false,
        read: { ...NOT_READ, failed: true },
        sample: sampleReport(),
      })
    ).toEqual({
      kind: "none",
      problems: ["No report of 2026-W46 could be read"],
    })
    expect(
      reportStageOf({
        week: "2026-W46",
        viewer: false,
        read: { ...NOT_READ, pending: true },
        sample: sampleReport(),
      })
    ).toEqual({ kind: "waiting" })
    const broken = reportStageOf({
      week: "2026-W46",
      viewer: false,
      read: read({ schema: "something else" }),
      sample: sampleReport(),
    })
    expect(broken.kind).toBe("none")
  })
})

describe("the registry's report", () => {
  it("fits the template's tables, each within the frame's lines", () => {
    // Every line the registry names, on a week with a record: what home's
    // first reports draw.
    const report = reportWeek(
      { week: "2026-W46", now: [], last: [], quarter: null, year: null },
      PIPELINES
    )
    expect(reportProblems(report)).toEqual([])
    expect(reportPages(report).length).toBeGreaterThan(0)
  })
})
