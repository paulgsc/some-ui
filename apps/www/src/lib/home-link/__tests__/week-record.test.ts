/**
 * RR30: a closed week (Rust Rounds', the interview's) reads what home's own record says was sent
 * (`GET /rust-weeks/:id/record`, `GET /interview-weeks/:id/record`), and says nothing of home it didn't hear.
 * #3269: a Rust Rounds week with an opening reads which take each question plays.
 */
import { describe, expect, it } from "vitest"

import {
  readOpening,
  readWeekRecord,
  weekRecordPath,
} from "@/lib/home-link/week-record"

const ok = (body: unknown): { status: number; body: string } => ({
  status: 200,
  body: JSON.stringify(body),
})

describe("home's record of a week (RR30)", () => {
  it("asks the week's record by its id", () => {
    expect(weekRecordPath("rust-weeks", "2026-w46")).toBe(
      "/rust-weeks/2026-w46/record"
    )
    expect(weekRecordPath("interview-weeks", "2026-w47")).toBe(
      "/interview-weeks/2026-w47/record"
    )
  })

  it("reads the send home holds, or none", () => {
    // As home answered the S21's w46 (final, promoted from the draft).
    expect(
      readWeekRecord(
        ok({
          week: "2026-w46",
          closed: true,
          sent: {
            at: "2026-11-14T19:59:07.012Z",
            receivedAt: "2026-11-14T23:24:40.802Z",
            draft: false,
          },
          tickets: [],
        })
      )
    ).toEqual({ kind: "sent", at: "2026-11-14T19:59:07.012Z" })
    expect(readWeekRecord(ok({ closed: true, sent: null }))).toEqual({
      kind: "none",
    })
  })

  it("reads the opening's takes home plays, each from its week (#3269)", () => {
    const take = {
      n: 1,
      take: "note-q1",
      recordedAt: "2026-11-12T21:40:00.000Z",
      week: "2026-w46",
      version: 1,
    }
    expect(
      readOpening(
        ok({
          sent: null,
          opening: [
            { ...take, ms: 24_000 },
            { ...take, n: 2, take: "note-q2" },
            { ...take, n: 3, take: "note-q3", ms: null },
          ],
        })
      )
    ).toEqual({
      kind: "known",
      takes: [
        { ...take, ms: 24_000 },
        { ...take, n: 2, take: "note-q2", ms: null },
        { ...take, n: 3, take: "note-q3", ms: null },
      ],
    })
    // A home at the opening's epoch with no take of any question.
    expect(readOpening(ok({ sent: null, opening: [] }))).toEqual({
      kind: "known",
      takes: [],
    })
    // A home before the opening says nothing of it; one that doesn't read
    // is unheard, and what was sent still reads.
    const unread = ok({ sent: null, opening: [{ n: "one" }] })
    expect(readOpening(ok({ sent: null }))).toEqual({ kind: "unknown" })
    expect(readOpening(unread)).toEqual({ kind: "unknown" })
    expect(readWeekRecord(unread)).toEqual({ kind: "none" })
  })

  it("hears nothing from any other answer, never none", () => {
    for (const odd of [
      { status: 404, body: JSON.stringify({ error: "not found" }) },
      { status: 429, body: "" },
      { status: 500, body: "" },
      { status: 200, body: "not json" },
      ok({}),
      ok({ sent: { at: 7 } }),
    ]) {
      expect(readWeekRecord(odd)).toEqual({ kind: "unknown" })
      expect(readOpening(odd)).toEqual({ kind: "unknown" })
    }
  })
})
