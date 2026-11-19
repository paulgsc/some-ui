/**
 * Past weeks (IW17): which weeks show, in what order, with which send, and
 * where each essay stands over every combination of the feed's list and
 * home's render board that decides it.
 */
import type { InterviewWeek } from "@some-ui/interview-week"
import { describe, expect, it } from "vitest"

import type { Episode, ListState } from "@/lib/call-videos/model"
import { essayOf, pastWeeks } from "@/lib/interview-week/past"
import type { InterviewSent } from "@/lib/interview-week/spec"
import type { Board } from "@/lib/renders/model"

import { WEEK } from "./fixture"

const W46: InterviewWeek = {
  ...WEEK,
  id: "2026-w46",
  opens: "2026-11-09T00:00:00-08:00",
  due: "2026-11-15T23:59:00-08:00",
}
const W45: InterviewWeek = {
  ...WEEK,
  id: "2026-w45",
  opens: "2026-11-02T00:00:00-08:00",
  due: "2026-11-08T23:59:00-08:00",
}
/** Wednesday of week 47: 46 and 45 have closed, 47 hasn't. */
const AT = "2026-11-18T18:00:00Z"

const episode = (over: Partial<Episode>): Episode => ({
  key: W46.id,
  videoBytes: 1_000,
  restBytes: null,
  link: null,
  receipts: [],
  ...over,
})

const read = (...episodes: Array<Episode>): ListState => ({
  kind: "read",
  episodes,
})

const BOARD: Board = {
  now: null,
  waiting: [],
  failed: [],
  done: [],
  coming: [],
}
const row = { feed: "interview-essay", key: W46.id, at: 0 }

const sent = (week: string, at: string): InterviewSent => ({
  week,
  at,
  answers: [
    { question: "conflict", take: "t1", recordedAt: at },
    { question: "why-now", take: "t2", recordedAt: at },
  ],
  reads: [],
  passed: [],
  passedReads: [],
})

describe("past weeks (IW17)", () => {
  it("lists each closed week, newest first, with its latest send", () => {
    const weeks = pastWeeks(
      [
        { week: W45, sha256: "a" },
        { week: WEEK, sha256: "b" },
        { week: W46, sha256: "c" },
      ],
      [
        sent(W46.id, "2026-11-14T10:00:00Z"),
        sent(W46.id, "2026-11-15T10:00:00Z"),
        sent(WEEK.id, "2026-11-17T10:00:00Z"),
      ],
      AT,
      read(),
      BOARD
    )
    expect(weeks.map(({ week }) => week.id)).toEqual([W46.id, W45.id])
    expect(weeks[0]?.sent?.at).toBe("2026-11-15T10:00:00Z")
    expect(weeks[1]?.sent).toBeNull()
  })

  it("says only how home's list stands while it isn't read", () => {
    expect(essayOf(W46, { kind: "reading" }, BOARD)).toEqual({
      kind: "asking",
    })
    expect(essayOf(W46, { kind: "unpaired" }, BOARD)).toEqual({
      kind: "unpaired",
    })
    expect(essayOf(W46, { kind: "older" }, BOARD)).toEqual({ kind: "older" })
    const unread: Array<ListState> = [
      { kind: "away" },
      { kind: "busy" },
      { kind: "unreadable" },
    ]
    for (const list of unread) {
      expect(essayOf(W46, list, BOARD)).toEqual({ kind: "unknown" })
    }
  })

  // Home lists an essay once it is written, its video null until made
  // (paulgsc/server feeds/videos.rs), one part per week.
  const written = episode({ videoBytes: null })

  it("is expected while home lists no essay of the week", () => {
    expect(essayOf(W46, read(), BOARD)).toEqual({ kind: "expected" })
    expect(essayOf(W46, read(episode({ key: W45.id })), null)).toEqual({
      kind: "expected",
    })
  })

  it("is ready once Episodes shows its video, on home or out", () => {
    expect(essayOf(W46, read(episode({})), null)).toEqual({
      kind: "ready",
      key: W46.id,
    })
    const out = episode({
      videoBytes: null,
      receipts: [
        { key: W46.id, step: "video", url: "file", size: 1, deletedAt: AT },
      ],
    })
    expect(essayOf(W46, read(out), BOARD)).toEqual({
      kind: "ready",
      key: W46.id,
    })
  })

  it("is written, waiting, being made or failed, as the board says of its video", () => {
    expect(essayOf(W46, read(written), null)).toEqual({ kind: "written" })
    expect(essayOf(W46, read(written), BOARD)).toEqual({ kind: "written" })
    const now: NonNullable<Board["now"]> = {
      feed: row.feed,
      key: row.key,
      state: "rendering",
      since: 0,
      stateSince: 0,
      gaveWay: 0,
      heldBy: null,
      stuck: false,
      estimate: null,
    }
    expect(essayOf(W46, read(written), { ...BOARD, now })).toEqual({
      kind: "making",
    })
    // A job waiting for room on the line, or set aside, isn't being made.
    for (const state of ["waiting", "paused"] as const) {
      expect(
        essayOf(W46, read(written), { ...BOARD, now: { ...now, state } })
      ).toEqual({ kind: "waiting" })
    }
    expect(
      essayOf(W46, read(written), {
        ...BOARD,
        now: { ...now, state: "finishing" },
      })
    ).toEqual({ kind: "making" })
    expect(essayOf(W46, read(written), { ...BOARD, waiting: [row] })).toEqual({
      kind: "waiting",
    })
    const failed = { ...row, by: "home", exit: 1, reason: "too-long" } as const
    // A failed render still leaves the essay listed without its video.
    expect(essayOf(W46, read(written), { ...BOARD, failed: [failed] })).toEqual(
      { kind: "failed" }
    )
    // Another week's row, or another feed's, says nothing of this one.
    const other: Board = {
      ...BOARD,
      now: { ...now, key: W45.id },
      waiting: [{ ...row, feed: "rust-essay" }],
      failed: [{ ...failed, key: W45.id }],
    }
    expect(essayOf(W46, read(written), other)).toEqual({ kind: "written" })
  })
})
