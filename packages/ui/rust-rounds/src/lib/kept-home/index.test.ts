import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { keptGoing } from "@rust-rounds/lib/kept-home"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import type { WeekSent } from "@rust-rounds/lib/week-play/spec"
import { pasteStores, weeksSent } from "@rust-rounds/lib/week-play/store"
import { keptWeeks } from "@rust-rounds/lib/weeks"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const MID = Date.parse("2026-11-13T21:00:00.000Z")
const AFTER = Date.parse(QUILLMOSS_WEEK.due) + 60_000

const SENT: WeekSent = {
  week: "2026-w46",
  at: "2026-11-12T20:00:00.000Z",
  answers: [
    {
      ticket: "QM-312",
      take: "take-312",
      recordedAt: "2026-11-12T19:58:00.000Z",
    },
  ],
  passed: ["QM-311", "QM-313"],
}

describe("keptGoing", () => {
  it("names each week sent, paste kept and log sitting, each as home takes it", () => {
    const storage = inMemoryStorage()
    weeksSent(storage).keep((kept) => [...kept, SENT])
    pasteStores(storage).pastes.add({
      week: "2026-w46",
      at: "2026-11-11T08:00:00.000Z",
      text: "error[E0499]",
      note: null,
    })
    keptRounds(storage).append(
      { id: "sitting-1", startedAt: "2026-11-01T10:00:00.000Z" },
      { kind: "pin", ref: { round: "indexing-01", card: "a" } }
    )

    const going = keptGoing(storage, MID)
    expect(going.map(({ kind, path }) => [kind, path])).toEqual([
      ["rustWeeks", "/rust-weeks/2026-w46/sent"],
      [
        "rustPastes",
        "/rust-weeks/2026-w46/pastes/2026-11-11T08%3A00%3A00.000Z",
      ],
      ["roundLog", "/rust-round-log/sessions/sitting-1"],
    ])
    expect(going[0]?.wire).toEqual(SENT)
    expect(going[0]?.id).toBe("2026-w46/2026-11-12T20:00:00.000Z")
    expect(going[1]?.wire).toEqual({
      at: "2026-11-11T08:00:00.000Z",
      text: "error[E0499]",
      note: null,
    })
    expect(going[2]?.wire).toMatchObject({
      schema: LOG_SCHEMA,
      id: "sitting-1",
    })
  })

  it("sends only a week's latest send, and nothing once the week has closed (RR22)", () => {
    const storage = inMemoryStorage()
    const again: WeekSent = {
      ...SENT,
      at: "2026-11-13T20:00:00.000Z",
      passed: ["QM-313"],
      answers: [
        ...SENT.answers,
        { ticket: "QM-311", take: "t", recordedAt: "2026-11-13T19:00:00Z" },
      ],
    }
    weeksSent(storage).keep((kept) => [...kept, SENT, again])
    const weeksAt = (at: number): Array<[string, unknown]> =>
      keptGoing(storage, at)
        .filter(({ kind }) => kind === "rustWeeks")
        .map(({ id, wire }) => [id, wire])
    expect(weeksAt(MID)).toEqual([["2026-w46/2026-11-13T20:00:00.000Z", again]])
    // A week this phone doesn't hold goes whatever the clock says.
    expect(weeksAt(AFTER)).toHaveLength(1)
    keptWeeks(storage).hold({
      weeks: [
        { week: QUILLMOSS_WEEK, sha256: "a".repeat(64), runs: {}, ended: [] },
      ],
      unread: [],
    })
    expect(weeksAt(MID)).toHaveLength(1)
    expect(weeksAt(AFTER)).toEqual([])
  })
})
