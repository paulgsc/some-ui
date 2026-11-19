/**
 * RR30: a closed week reads what home's own record says was sent
 * (`GET /rust-weeks/:id/record`), and says nothing of home it didn't hear.
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
    ).toEqual({ kind: "sent", at: "2026-11-14T19:59:07.012Z" })
    expect(readWeekRecord(ok({ closed: true, sent: null }))).toEqual({
      kind: "none",
    })
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
    }
  })
})
