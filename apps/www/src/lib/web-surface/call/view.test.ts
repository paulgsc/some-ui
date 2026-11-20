import { captionSpace, LANDSCAPE } from "@some-ui/burn-ins"
import { PIPELINES } from "@some-ui/engagement"
import { QUILLMOSS_WEEK, TALLOWBROOK_WEEK_FILE } from "@some-ui/rust-rounds"
import {
  CALL_INDEX_SCHEMA,
  CALL_STAGE_WORDS,
  CALL_VERSION,
  ESSAY_ZOOM_FOOT,
  essayIntro,
  fitsAllowance,
  parseEssay,
  reportPages,
  reportProblems,
  reportWeek,
  sampleCallWeek,
  sampleEssay,
  sampleInterviewEssay,
  sampleReport,
} from "@some-ui/video-render"
import type {
  CallIndex,
  CallWeek,
  EngagementReport,
  Essay,
  InterviewEssay,
} from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { essayAt, essayStageOf } from "./essay-view"
import { interviewEssayAt } from "./interview-essay-view"
import { reportAt, reportStageOf } from "./report-view"
import { screenStageOf } from "./rust-screen-view"
import { callAt, stageOf, weekFrom } from "./view"
import { CALL_WORDS } from "./words"

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
      continued: false,
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
    // The opening conversation (#3269), first after the brand: the one
    // asking speaks each question, then the owner's take answers it.
    const opened = {
      ...essay(),
      opening: {
        exchanges: [
          {
            n: 2,
            ask: "Why weekly?",
            transcript: "To practise deciding.",
            take: "note-open-2",
          },
        ],
      },
    }
    expect(essayAt(opened, "ask-2")).toMatchObject({
      speaker: "asker",
      view: { section: "ask", n: 2, ask: "Why weekly?" },
    })
    expect(essayAt(opened, "opening-2")).toMatchObject({
      speaker: "you",
      view: {
        section: "opening",
        n: 2,
        ask: "Why weekly?",
        transcript: "To practise deciding.",
      },
    })
  })

  it("draws a point answered by a take of its own as its own answer scene (RR24)", () => {
    const sample = essay()
    const first = sample.tickets.at(0)
    if (first === undefined) throw new Error("a ticket")
    const rest = sample.tickets.slice(1)
    const own = {
      ...sample,
      tickets: [
        {
          ...first,
          points: first.points.map((point, i) =>
            i === 1
              ? {
                  ...point,
                  answer: {
                    kind: "take" as const,
                    transcript: "Point two, said alone.",
                    mark: { mark: "covered" as const },
                    solo: { level: 4, why: "One reason." },
                  },
                }
              : point
          ),
        },
        ...rest,
      ],
    }
    const at = essayAt(own, "answer-2")
    expect(at.speaker).toBe("you")
    expect(
      at.view.section === "answer" && [at.view.ticket.id, at.view.point]
    ).toEqual(["QM-311", 1])
    expect(essayAt(own, "answer-3").view).toMatchObject({
      section: "answer",
      ticket: { id: "QM-312" },
    })
  })

  it("draws a fork scene with its ticket, point and fork (RR29)", () => {
    const sample = essay()
    const first = sample.tickets.at(0)
    const point = first?.points.at(1)
    if (first === undefined || point === undefined) throw new Error("shape")
    const fork = {
      options: [
        {
          id: "A",
          recommended: true,
          decision: "Clone it.",
          model: { id: "own", name: "Own it" },
          meets: [],
          breaks: ["S1"],
          because: "In a few words.",
        },
        {
          id: "B",
          recommended: false,
          decision: "Borrow it.",
          model: { id: "borrow", name: "Borrow it" },
          meets: ["S1"],
          breaks: [],
          because: "In a few words.",
        },
      ],
      best: { kind: "option" as const, option: "B" },
      said: "B meets S1.",
    }
    const forked = {
      ...sample,
      template: { ...sample.template, version: 4 },
      tickets: [
        {
          ...first,
          stated: [{ id: "S1", says: "p99 under 2 ms" }],
          points: first.points.map((each, i) =>
            i === 1 ? { ...each, fork } : each
          ),
        },
        ...sample.tickets.slice(1),
      ],
    }
    const at = essayAt(forked, "fork-1")
    expect(at.speaker).toBe("tutor")
    expect(
      at.view.section === "fork" && [
        at.view.ticket.id,
        at.view.point,
        at.view.fork,
      ]
    ).toEqual(["QM-311", 1, fork])
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

describe("a zoomed card in the essay (RR31)", () => {
  it("stays above the band the stage keeps for captions", () => {
    expect(ESSAY_ZOOM_FOOT).toBe(captionSpace(LANDSCAPE) / LANDSCAPE.height)
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
  const parse = parseEssay

  it("is the sample, voiced as one, with no week or with `sample`", () => {
    for (const week of [undefined, "sample"]) {
      const state = essayStageOf({ week, read: read(undefined), sample, parse })
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
      parse,
    })
    expect(state.kind === "show" && state.voicing).toBe("owner")
    expect(
      essayStageOf({
        week: "2026-w46",
        read: read(undefined, { pending: true }),
        sample,
        parse,
      })
    ).toEqual({ kind: "waiting" })
  })

  it("is never the sample in place of a week it can't read", () => {
    expect(
      essayStageOf({
        week: "2026-w46",
        read: read(undefined, { failed: true }),
        sample,
        parse,
      })
    ).toEqual({
      kind: "none",
      problems: ["No essay of 2026-w46 could be read"],
    })
    expect(
      essayStageOf({ week: "2026-w47", read: read(essay()), sample, parse })
    ).toEqual({
      kind: "none",
      problems: ["The essay read is 2026-w46's, not 2026-w47's"],
    })
    const broken = essayStageOf({
      week: "2026-w46",
      read: read({ ...essay(), tickets: [] }),
      sample,
      parse,
    })
    expect(broken.kind === "none" && broken.problems.length).toBeGreaterThan(0)
  })
})

describe("an interview essay's stage (IW6)", () => {
  const sample = sampleInterviewEssay()
  const essay = (): InterviewEssay => {
    if (!sample.ok) throw new Error(sample.problems.join("; "))
    return sample.value
  }

  it("draws a question's scenes from its question, and a read's from its card", () => {
    const faults = interviewEssayAt(essay(), "faults-1").view
    expect(faults.section === "faults" && faults.question.id).toBe("a-time-you")
    const heard = interviewEssayAt(essay(), "heard-1").view
    expect(heard.section === "heard" && heard.read.id).toBe("keep-it-first")
    expect(interviewEssayAt(essay(), "reading-2").speaker).toBe("tutor")
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

describe("the stage's own words, as the call's model sets them (CF1)", () => {
  it("marks no wider than the model's widest mark", () => {
    const marks = [
      CALL_WORDS.recommended,
      CALL_WORDS.chose,
      CALL_WORDS.change.story,
      CALL_WORDS.change.defect,
    ]
    for (const mark of marks)
      expect(fitsAllowance(mark, CALL_STAGE_WORDS.mark, "caps"), mark).toBe(
        true
      )
  })

  it("labels what an option unblocks no wider than the model does", () => {
    expect(
      fitsAllowance(
        `${CALL_WORDS.unblocks}:`,
        CALL_STAGE_WORDS.unblocks,
        "prose"
      )
    ).toBe(true)
  })
})

/** The week as home serves it (`GET /rust-weeks/<id>`). */
const served = {
  id: TALLOWBROOK_WEEK_FILE.id,
  sha256: "a".repeat(64),
  week: TALLOWBROOK_WEEK_FILE,
  tickets: [],
}

const WEEK = TALLOWBROOK_WEEK_FILE.id

type Read = { data: unknown; pending: boolean; failed: boolean }

const read = (
  data: unknown,
  over: Partial<{ pending: boolean; failed: boolean }> = {}
): Read => ({
  data,
  pending: false,
  failed: false,
  ...over,
})

const first = QUILLMOSS_WEEK.tickets[0]?.id
const second = TALLOWBROOK_WEEK_FILE.tickets[1]?.id

describe("the Rust Rounds screen stage (RR31)", () => {
  it("draws the ticket asked for, from the week home handed over", () => {
    const state = screenStageOf({
      week: WEEK,
      ticket: second,
      viewer: false,
      read: read(served),
    })
    expect(state.kind === "screen" && state.ticket.id).toBe(second)
  })

  it("draws the sample for a viewer, or with no week, whatever was read", () => {
    for (const [week, viewer] of [
      [undefined, false],
      ["sample", false],
      [WEEK, true],
    ] as const) {
      const state = screenStageOf({
        week,
        ticket: undefined,
        viewer,
        read: read(undefined, { failed: true }),
      })
      expect(state.kind === "screen" && state.ticket.id).toBe(first)
    }
  })

  it("waits for the read, and refuses one that failed or holds another week", () => {
    const at = (
      r: Read,
      week: string = WEEK
    ): ReturnType<typeof screenStageOf> =>
      screenStageOf({ week, ticket: undefined, viewer: false, read: r })
    expect(at(read(undefined, { pending: true })).kind).toBe("waiting")
    expect(at(read(undefined, { failed: true }))).toMatchObject({
      kind: "none",
    })
    expect(at(read(served), "2026-w01")).toMatchObject({
      kind: "none",
      problems: [`the file holds the week of ${WEEK}, not 2026-w01`],
    })
  })

  it("refuses a ticket the week doesn't have", () => {
    expect(
      screenStageOf({
        week: WEEK,
        ticket: "ZZ-1",
        viewer: false,
        read: read(served),
      })
    ).toMatchObject({ kind: "none" })
  })
})
