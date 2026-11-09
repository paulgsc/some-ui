import {
  CALL_INDEX_SCHEMA,
  CALL_VERSION,
  sampleCallWeek,
  sampleEssay,
} from "@some-ui/video-render"
import type { CallIndex, CallWeek, Essay } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { essayAt } from "./essay-view"
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
  it("lights the owner's bubble for a take, and the tutor's for a silence", () => {
    const take = essayAt(essay(), "answer-1")
    expect(take.speaker).toBe("you")
    expect(take.view.section === "answer" && take.view.ticket.id).toBe("QM-311")
    expect(essayAt(essay(), "answer-3").speaker).toBe("tutor")
    expect(essayAt(essay(), "best-3").speaker).toBe("tutor")
  })

  it("draws each deep dive with its ticket, and says when it goes past it", () => {
    const dives = [1, 2, 3, 4, 5, 6].map((n) => essayAt(essay(), `dive-${n}`))
    expect(
      dives.map((at) =>
        at.view.section === "dive"
          ? [at.view.ticket.id, at.view.n, at.view.past]
          : null
      )
    ).toEqual([
      ["QM-311", 1, false],
      ["QM-311", 2, true],
      ["QM-312", 1, false],
      ["QM-312", 2, false],
      ["QM-313", 1, false],
      ["QM-313", 2, false],
    ])
  })

  it("numbers each ticket's chapter, and draws the weeks with decay marked", () => {
    expect(essayAt(essay(), "chapter-question-2").view).toEqual({
      section: "chapter",
      title: "QM-312: Reuse the read buffer without losing the fields",
      ticket: { n: 2, of: 3 },
    })
    const weeks = essayAt(essay(), "weeks").view
    const buffer =
      weeks.section === "weeks"
        ? weeks.rows.find((row) => row.name === "Borrows into a reused buffer")
        : undefined
    expect(buffer?.cells.at(-1)).toEqual({
      kind: "level",
      level: 3,
      decayed: true,
    })
  })

  it("opens on the first scene when the id names none", () => {
    expect(essayAt(essay(), "nope").scene.id).toBe("intro")
    expect(essayAt(essay(), undefined).index).toBe(0)
  })
})
