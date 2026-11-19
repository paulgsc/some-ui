/**
 * The week's opening on the phone (#3269): which take of each question is
 * in place, whatever home has said and whatever was said here, and the
 * takes a week sent carries.
 */
import { openingOfWeek } from "@rust-rounds/lib/opening"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import type {
  HomeOpening,
  OpeningAtHome,
  OpeningHere,
} from "@rust-rounds/lib/week-play/opening"
import {
  inPlace,
  OPENING_UNKNOWN,
  openingPlace,
} from "@rust-rounds/lib/week-play/opening"
import { openingItem } from "@rust-rounds/lib/week-play/points"
import type { WeekSent } from "@rust-rounds/lib/week-play/spec"
import { weekMachine } from "@rust-rounds/lib/week-play/spec"
import type { BundleAnswer } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

const LAST_WEEK: OpeningAtHome = {
  n: 1,
  take: "note-w46",
  recordedAt: "2026-11-12T21:40:00.000Z",
  week: "2026-w46",
  version: 1,
  ms: 24_000,
}

const known = (...takes: ReadonlyArray<OpeningAtHome>): HomeOpening => ({
  kind: "known",
  takes,
})

const HERE: OpeningHere = {
  take: "take-w47",
  recordedAt: "2026-11-18T08:00:00.000Z",
  ms: 21_000,
}

describe("where a question's take stands", () => {
  it("is not known until home says, unless one was said here", () => {
    expect(openingPlace(1, 1, OPENING_UNKNOWN, null)).toEqual({
      kind: "unknown",
    })
    expect(openingPlace(1, 1, OPENING_UNKNOWN, HERE)).toEqual({
      kind: "here",
      ...HERE,
    })
  })

  it("is home's take once home names one, from whichever week", () => {
    expect(openingPlace(1, 1, known(LAST_WEEK), null)).toEqual({
      kind: "home",
      ...LAST_WEEK,
    })
    expect(inPlace(openingPlace(1, 1, known(LAST_WEEK), null))).toBe(true)
  })

  it("is none where home names no take of this question under this version", () => {
    for (const home of [
      known(),
      known({ ...LAST_WEEK, n: 2 }),
      known({ ...LAST_WEEK, version: 2 }),
    ]) {
      const place = openingPlace(1, 1, home, null)
      expect(place).toEqual({ kind: "none" })
      expect(inPlace(place)).toBe(false)
    }
  })

  it("is the take said here when it is newer than home's, and home's once home names it (C784)", () => {
    expect(openingPlace(1, 1, known(LAST_WEEK), HERE).kind).toBe("here")
    // Home named this very take, once sent: it plays from home.
    const sent = { ...LAST_WEEK, take: HERE.take, week: "2026-w47" }
    expect(openingPlace(1, 1, known(sent), HERE).kind).toBe("home")
    // Home names a newer take than the one here: home's.
    const newer = { ...LAST_WEEK, recordedAt: "2026-11-19T08:00:00.000Z" }
    expect(openingPlace(1, 1, known(newer), HERE).kind).toBe("home")
  })
})

describe("a week sent with the opening's takes", () => {
  const week = { ...TALLOWBROOK_WEEK_FILE, opening: openingOfWeek() }
  const machine = weekMachine(week, {
    perPoint: true,
    opening: { version: 1, count: 3 },
    msOf: (id) => (id === "q1" ? 24_000.4 : null),
  })
  const draft = {
    id: "2026-w47",
    at: "2026-11-17T00:00:00Z",
    typed: {},
    later: [],
  }
  const answer = (item: string, id: string, at: string): BundleAnswer => ({
    item,
    take: { id, at },
    typed: null,
  })

  it("puts the questions first, and their takes under the opening, never among the tickets", () => {
    expect(machine.spec.items.slice(0, 3)).toEqual([
      openingItem(1),
      openingItem(2),
      openingItem(3),
    ])
    const sent = machine.spec.record(
      draft,
      [
        answer(openingItem(1), "q1", "2026-11-18T08:00:00Z"),
        answer("TB-101:1", "t1", "2026-11-18T09:00:00Z"),
      ],
      [],
      "2026-11-18T10:00:00Z",
      null
    )
    expect(sent.opening).toEqual([
      {
        n: 1,
        take: "q1",
        recordedAt: "2026-11-18T08:00:00Z",
        version: 1,
        // Home keeps whole milliseconds.
        ms: 24_000,
      },
    ])
    expect(sent.answers.map(({ take }) => take)).toEqual(["t1"])
    expect(sent.passed).not.toContain(openingItem(1))
    // Named, so the take is never swept as one nothing sends, and a new
    // one alone is a change to send again.
    expect(machine.spec.named(sent)).toEqual(["t1", "q1"])
  })

  it("sends again with every take the week said, an earlier send's included", () => {
    const first: WeekSent = {
      week: "2026-w47",
      at: "2026-11-18T10:00:00Z",
      answers: [],
      passed: [],
      opening: [
        {
          n: 2,
          take: "q2",
          recordedAt: "2026-11-18T08:00:00Z",
          version: 1,
          ms: 9,
        },
      ],
    }
    const again = machine.spec.record(
      draft,
      [answer(openingItem(1), "q1", "2026-11-18T11:00:00Z")],
      [],
      "2026-11-18T12:00:00Z",
      first
    )
    expect(again.opening?.map(({ n, take }) => [n, take])).toEqual([
      [1, "q1"],
      [2, "q2"],
    ])
  })

  it("carries no opening where the week records none", () => {
    const plain = weekMachine(week, { perPoint: true })
    expect(plain.spec.items[0]).toBe("TB-101")
    expect(
      plain.spec.record(draft, [], [], "2026-11-18T12:00:00Z", null)
    ).not.toHaveProperty("opening")
  })
})
