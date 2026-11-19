/**
 * RR30: a closed week reads what home's own record says was sent
 * (`GET /rust-weeks/:id/record`), and says nothing of home it didn't hear.
 * #3269: a week with an opening reads which take each question plays.
 */
import { describe, expect, it } from "vitest"

import {
  readWeekRecord,
  weekRecordPath,
} from "@/lib/home-link/rust-week-record"

const ok = (body: unknown): { status: number; body: string } => ({
  status: 200,
  body: JSON.stringify(body),
})

describe("home's record of a Rust Rounds week (RR30)", () => {
  it("asks the week's record by its id", () => {
    expect(weekRecordPath("2026-w46")).toBe("/rust-weeks/2026-w46/record")
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
    ).toEqual({
      sent: { kind: "sent", at: "2026-11-14T19:59:07.012Z" },
      // A home before the opening plays none.
      opening: { kind: "known", takes: [] },
    })
    expect(readWeekRecord(ok({ closed: true, sent: null })).sent).toEqual({
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
      readWeekRecord(
        ok({
          sent: null,
          opening: [
            { ...take, ms: 24_000 },
            { ...take, n: 2, take: "note-q2" },
          ],
        })
      ).opening
    ).toEqual({
      kind: "known",
      takes: [
        { ...take, ms: 24_000 },
        { ...take, n: 2, take: "note-q2", ms: null },
      ],
    })
    // An opening that doesn't read is unheard; what was sent still reads.
    expect(readWeekRecord(ok({ sent: null, opening: [{ n: "one" }] }))).toEqual(
      { sent: { kind: "none" }, opening: { kind: "unknown" } }
    )
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
      expect(readWeekRecord(odd)).toEqual({
        sent: { kind: "unknown" },
        opening: { kind: "unknown" },
      })
    }
  })
})
