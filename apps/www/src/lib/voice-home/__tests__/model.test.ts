/**
 * The record of voice notes on their way home (`../model`): each event from
 * every state it can meet, and the stored shape read back; and how a run
 * ends after a copy pass, for every note's end and every exchange's (LA14).
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type {
  CopyEnd,
  CopyPass,
  VoiceHomeState,
  VoiceOut,
} from "@/lib/voice-home/model"
import {
  ASIDE_ANSWERED_MAX,
  INITIAL_VOICE_HOME,
  keptIn,
  marksDue,
  NO_ASIDE,
  NO_PASS,
  NO_ROOM,
  parseVoiceHome,
  passWith,
  runEnd,
  settled,
  stepVoiceHome,
  UNKNOWN_PAIRING,
  VOICE_OFS,
} from "@/lib/voice-home/model"

const NOTE: VoiceOut = {
  id: "n1",
  of: "reflection",
  ref: "session-7f2a",
  at: "2026-10-25T03:10:00.000Z",
  contentType: "audio/webm;codecs=opus",
}
const OTHER: VoiceOut = { ...NOTE, id: "n2" }
/** When this phone heard home say it holds a note. */
const HEARD = "2026-10-25T03:12:00.000Z"
/** The pairing the phone holds, and another home's (HP1). */
const PAIRING = "pairing-1"
const ANOTHER = "pairing-2"
/** A record under `PAIRING`, nothing copied yet. */
const PAIRED: VoiceHomeState = { ...INITIAL_VOICE_HOME, pairing: PAIRING }

const copied = (state: VoiceHomeState, note: VoiceOut): VoiceHomeState =>
  stepVoiceHome(state, { kind: "copied", note })

describe("the record of voice notes on their way home", () => {
  it("copies a note once, oldest first, and a note with no room waits for it", () => {
    const roomless = stepVoiceHome(INITIAL_VOICE_HOME, {
      kind: "roomless",
      id: "n1",
    })
    expect(roomless.roomless).toEqual(["n1"])
    expect(stepVoiceHome(roomless, { kind: "roomless", id: "n1" })).toBe(
      roomless
    )
    expect(settled(roomless, "n1")).toBe(false)

    const one = copied(roomless, NOTE)
    expect(one).toEqual({ ...INITIAL_VOICE_HOME, waiting: [NOTE] })
    expect(copied(one, { ...NOTE, ref: "other" })).toBe(one)
    expect(copied(one, OTHER).waiting).toEqual([NOTE, OTHER])
    expect(stepVoiceHome(one, { kind: "roomless", id: "n1" })).toBe(one)
  })

  it("moves a waiting note to held or refused, once, and never copies it again", () => {
    const two = copied(copied(PAIRED, NOTE), OTHER)
    const held = stepVoiceHome(two, {
      kind: "held",
      id: "n1",
      at: HEARD,
      pairing: PAIRING,
    })
    expect(held.waiting).toEqual([OTHER])
    expect(held.held).toEqual(["n1"])
    expect(held.heldAt).toEqual({ n1: HEARD })
    expect(
      stepVoiceHome(held, {
        kind: "held",
        id: "n1",
        at: "2026-12-01T00:00Z",
        pairing: PAIRING,
      })
    ).toBe(held)
    expect(copied(held, NOTE)).toBe(held)

    const refused = stepVoiceHome(held, {
      kind: "refused",
      id: "n2",
      why: "home holds another recording under its name",
    })
    expect(refused).toEqual({
      waiting: [],
      pairing: PAIRING,
      held: ["n1"],
      heldAt: { n1: HEARD },
      others: {},
      refused: [
        { id: "n2", why: "home holds another recording under its name" },
      ],
      roomless: [],
      aside: NO_ASIDE,
    })
    expect(settled(refused, "n2")).toBe(true)
    expect(copied(refused, OTHER)).toBe(refused)
    expect(
      stepVoiceHome(INITIAL_VOICE_HOME, { kind: "refused", id: "n9", why: "x" })
    ).toBe(INITIAL_VOICE_HOME)
  })

  it("names every kind home's voice_repo::Of takes, in its order (IW1)", () => {
    expect(VOICE_OFS).toEqual([
      "reflection",
      "jobs",
      "scene",
      "game",
      "studio",
      "soundbite",
      "lens",
      "leetype",
      "rust-round",
      "interview",
    ])
  })

  it("reads back what it stored, and nothing else", () => {
    const bite: VoiceOut = {
      ...NOTE,
      id: "b1",
      of: "game",
      ref: "401772981",
      fields: { how: "said-first", strip: "", watching: "1" },
    }
    const said: VoiceOut = {
      ...NOTE,
      id: "r1",
      of: "rust-round",
      ref: "indexing-01:a",
    }
    const answered: VoiceOut = {
      ...NOTE,
      id: "i1",
      of: "interview",
      ref: "2026-w47:read:home-first",
    }
    const state = stepVoiceHome(
      copied(
        copied(copied(copied(INITIAL_VOICE_HOME, NOTE), bite), said),
        answered
      ),
      {
        kind: "roomless",
        id: "n3",
      }
    )
    expect(parseVoiceHome(JSON.stringify(state))).toEqual(state)
    for (const raw of [
      "not json",
      "[]",
      JSON.stringify({ ...state, held: [1] }),
      JSON.stringify({ ...state, waiting: [{ ...NOTE, of: "diary" }] }),
      JSON.stringify({ ...state, waiting: [{ ...bite, fields: { how: 1 } }] }),
      JSON.stringify({ ...state, waiting: [{ ...bite, fields: { of: "x" } }] }),
      JSON.stringify({ ...state, refused: [{ id: "n" }] }),
      JSON.stringify({ ...state, heldAt: { n1: 1 } }),
      JSON.stringify({ ...state, heldAt: [] }),
      JSON.stringify({ waiting: [], held: [], refused: [] }),
    ]) {
      expect([raw, parseVoiceHome(raw)]).toEqual([raw, null])
    }
  })

  it("reads a record written before it noted when home held each note, guessing no time (MIC3), or any set-aside mark (MIC2)", () => {
    const before = { waiting: [], held: ["n1"], refused: [], roomless: [] }
    expect(parseVoiceHome(JSON.stringify(before))).toEqual({
      ...before,
      pairing: null,
      heldAt: {},
      others: {},
      aside: NO_ASIDE,
    })
  })
})

describe("the set-aside marks owed to home (MIC2)", () => {
  const LET_GO = "2026-11-01T09:15:00.000Z"
  const step = (
    state: VoiceHomeState,
    ...events: ReadonlyArray<Parameters<typeof stepVoiceHome>[1]>
  ): VoiceHomeState => events.reduce(stepVoiceHome, state)
  const held = step(copied(copied(PAIRED, NOTE), OTHER), {
    kind: "held",
    id: "n1",
    at: HEARD,
    pairing: PAIRING,
  })

  it("owes a mark once, the first time standing, and makes it due only for a note home holds", () => {
    const owed = step(
      held,
      { kind: "aside", id: "n1", at: LET_GO },
      { kind: "aside", id: "n2", at: LET_GO }
    )
    expect(owed.aside.owed).toEqual([
      { id: "n1", at: LET_GO },
      { id: "n2", at: LET_GO },
    ])
    expect(
      stepVoiceHome(owed, {
        kind: "aside",
        id: "n1",
        at: "2026-11-02T00:00:00.000Z",
      })
    ).toBe(owed)
    // n2 waits to go home: its mark waits with it.
    expect(marksDue(owed)).toEqual([{ id: "n1", at: LET_GO }])
    expect(
      marksDue(
        step(owed, { kind: "held", id: "n2", at: HEARD, pairing: PAIRING })
      )
    ).toHaveLength(2)
  })

  it("answers a mark for good once taken or never takeable, and never owes it again", () => {
    for (const kind of ["marked", "unmarkable"] as const) {
      const answered = step(
        held,
        { kind: "aside", id: "n1", at: LET_GO },
        { kind, id: "n1" }
      )
      expect(answered.aside).toEqual({ owed: [], answered: ["n1"] })
      expect(
        stepVoiceHome(answered, { kind: "aside", id: "n1", at: LET_GO })
      ).toBe(answered)
      // An answer for a mark not owed moves nothing.
      expect(stepVoiceHome(answered, { kind, id: "n2" })).toBe(answered)
    }
  })

  it("takes back a mark owed for a set-aside write that did not happen, and none answered", () => {
    const owed = step(held, { kind: "aside", id: "n1", at: LET_GO })
    expect(stepVoiceHome(owed, { kind: "unowed", id: "n1" }).aside).toEqual(
      NO_ASIDE
    )
    const answered = step(owed, { kind: "marked", id: "n1" })
    expect(stepVoiceHome(answered, { kind: "unowed", id: "n1" })).toBe(answered)
  })

  it("drops a mark owed for a note home refused, and owes none for one", () => {
    const owed = step(held, { kind: "aside", id: "n2", at: LET_GO })
    const refused = step(owed, { kind: "refused", id: "n2", why: "x" })
    expect(refused.aside.owed).toEqual([])
    expect(
      stepVoiceHome(refused, { kind: "aside", id: "n2", at: LET_GO })
    ).toBe(refused)
  })

  it("remembers at most ASIDE_ANSWERED_MAX answers, the newest, so a forgotten one costs a repeat", () => {
    let state = INITIAL_VOICE_HOME
    for (let i = 0; i <= ASIDE_ANSWERED_MAX; i += 1) {
      state = step(
        state,
        { kind: "aside", id: `n${String(i)}`, at: LET_GO },
        { kind: "marked", id: `n${String(i)}` }
      )
    }
    expect(state.aside.answered).toHaveLength(ASIDE_ANSWERED_MAX)
    expect(state.aside.answered[0]).toBe("n1")
    // The oldest is owed again, and home's answer to it is the same.
    expect(
      step(state, { kind: "aside", id: "n0", at: LET_GO }).aside.owed
    ).toEqual([{ id: "n0", at: LET_GO }])
  })

  it("reads the marks back, and refuses a record whose marks it can't read", () => {
    const state = step(
      held,
      { kind: "aside", id: "n1", at: LET_GO },
      { kind: "aside", id: "n2", at: LET_GO },
      { kind: "marked", id: "n1" }
    )
    expect(parseVoiceHome(JSON.stringify(state))).toEqual(state)
    // An earlier build's record: a count of runs home found no note, and
    // marks given up, are read past.
    const earlier = {
      ...state,
      aside: {
        owed: [{ id: "n2", at: LET_GO, unfound: 2 }],
        answered: ["n1"],
        givenUp: [{ id: "n9", at: LET_GO, why: "unfound" }],
      },
    }
    expect(parseVoiceHome(JSON.stringify(earlier))).toEqual(state)
    for (const aside of [
      [],
      { owed: [{ id: "n1" }], answered: [] },
      { owed: [], answered: [1] },
      { owed: [] },
    ]) {
      const raw = JSON.stringify({ ...state, aside })
      expect([raw, parseVoiceHome(raw)]).toEqual([raw, null])
    }
  })
})

describe("how a run ends after a copy pass (LA14)", () => {
  const ENDS: ReadonlyArray<CopyEnd | "fault"> = [
    "copied",
    "roomless",
    "unkept",
    "fault",
  ]
  const EXCHANGED: ReadonlyArray<HomeExchanged> = [
    { kind: "synced" },
    { kind: "forgotten" },
    { kind: "failed", why: "a voice note: home answered 500" },
  ]
  const passOf = (ends: ReadonlyArray<CopyEnd | "fault">): CopyPass =>
    ends.reduce(passWith, NO_PASS)

  it("fails a run that sent everything only for a note it could still copy, the phone's fault first, and never for one gone", () => {
    for (const a of ENDS) {
      for (const b of ENDS) {
        for (const gone of [new Set<string>(), new Set(["g1"])]) {
          const pass = { ...passOf([a, b]), gone }
          const ends = [a, b]
          const expected: HomeExchanged = ends.some(
            (end) => end === "unkept" || end === "fault"
          )
            ? { kind: "failed", why: "fault" }
            : ends.includes("roomless")
              ? { kind: "failed", why: NO_ROOM }
              : { kind: "synced" }
          expect(runEnd(pass, { kind: "synced" })).toEqual(expected)
          // What home said wins over what the phone could not copy.
          for (const exchanged of EXCHANGED.slice(1)) {
            expect(runEnd(pass, exchanged)).toBe(exchanged)
          }
        }
      }
    }
  })
})

describe("what home holds, by the pairing that said so (HP1, #2437)", () => {
  const step = (
    state: VoiceHomeState,
    ...events: ReadonlyArray<Parameters<typeof stepVoiceHome>[1]>
  ): VoiceHomeState => events.reduce(stepVoiceHome, state)
  const heldBy = (pairing: string, id: string, at = HEARD) =>
    ({ kind: "held", id, at, pairing }) as const
  /** n1 held by the first home, n2 waiting, n3 refused. */
  const first = step(
    copied(copied(copied(PAIRED, NOTE), OTHER), { ...NOTE, id: "n3" }),
    heldBy(PAIRING, "n1"),
    { kind: "refused", id: "n3", why: "x" }
  )

  it("reads nothing as held under another pairing or none, keeping the first home's word, and reads it again once that pairing is back", () => {
    for (const pairing of [ANOTHER, null]) {
      const moved = step(first, { kind: "paired", pairing })
      expect(moved).toMatchObject({
        pairing,
        held: [],
        heldAt: {},
        others: { [PAIRING]: { held: ["n1"], heldAt: { n1: HEARD } } },
        // Where each other note was is the phone's, not a home's.
        waiting: [OTHER],
        refused: [{ id: "n3", why: "x" }],
      })
      expect(keptIn(moved)("n1")).toEqual({ place: "phone" })
      expect(settled(moved, "n1")).toBe(false)
      const back = step(moved, { kind: "paired", pairing: PAIRING })
      expect(back).toEqual(first)
    }
    expect(step(first, { kind: "paired", pairing: PAIRING })).toBe(first)
    expect(step(INITIAL_VOICE_HOME, { kind: "paired", pairing: null })).toBe(
      INITIAL_VOICE_HOME
    )
  })

  it("copies a note again for another home, which holds it on its own word, and keeps both homes' word", () => {
    const moved = step(first, { kind: "paired", pairing: ANOTHER })
    const going = copied(moved, NOTE)
    expect(keptIn(going)("n1")).toEqual({ place: "going" })
    const later = "2026-11-13T08:00:00.000Z"
    const held = step(going, heldBy(ANOTHER, "n1", later))
    expect(keptIn(held)("n1")).toEqual({ place: "home", since: later })
    const back = step(held, { kind: "paired", pairing: PAIRING })
    expect(back.held).toEqual(["n1"])
    expect(back.heldAt).toEqual({ n1: HEARD })
    expect(back.others).toEqual({
      [ANOTHER]: { held: ["n1"], heldAt: { n1: later } },
    })
  })

  it("counts no word heard after the pairing changed under its run: the copy waits for this home", () => {
    const moved = step(first, { kind: "paired", pairing: ANOTHER })
    expect(step(moved, heldBy(PAIRING, "n2"))).toBe(moved)
    expect(keptIn(moved)("n2")).toEqual({ place: "going" })
    expect(step(moved, heldBy(ANOTHER, "n2")).held).toEqual(["n2"])
    // Unpaired, no run's word counts.
    const unpaired = step(first, { kind: "paired", pairing: null })
    expect(step(unpaired, heldBy(PAIRING, "n2"))).toBe(unpaired)
  })

  it("owes a mark only to a home that holds its note, and forgets none another home holds", () => {
    const owed = step(first, { kind: "aside", id: "n1", at: HEARD })
    expect(marksDue(owed)).toEqual([{ id: "n1", at: HEARD }])
    const moved = step(owed, { kind: "paired", pairing: ANOTHER })
    expect(marksDue(moved)).toEqual([])
    expect(step(moved, { kind: "gone", ids: ["n1"] })).toBe(moved)
    expect(marksDue(step(moved, { kind: "paired", pairing: PAIRING }))).toEqual(
      [{ id: "n1", at: HEARD }]
    )
  })

  it("takes an earlier build's record as the word of the first pairing it is seen under (C288)", () => {
    const before = JSON.stringify({
      waiting: [],
      held: ["n1"],
      heldAt: { n1: HEARD },
      refused: [],
      roomless: [],
    })
    const read = parseVoiceHome(before)
    expect(read).toMatchObject({ pairing: null, held: ["n1"], others: {} })
    if (read === null) throw new Error("unread")
    const claimed = step(read, { kind: "paired", pairing: PAIRING })
    expect(claimed).toMatchObject({ pairing: PAIRING, held: ["n1"] })
    expect(step(claimed, { kind: "paired", pairing: ANOTHER })).toMatchObject({
      held: [],
      others: { [PAIRING]: { held: ["n1"] } },
    })
  })

  it("keeps an earlier build's record seen first unpaired as no pairing's word, read as held by none (C288)", () => {
    const read = parseVoiceHome(
      JSON.stringify({ waiting: [], held: ["n1"], refused: [], roomless: [] })
    )
    if (read === null) throw new Error("unread")
    const unpaired = step(read, { kind: "paired", pairing: null })
    expect(unpaired).toMatchObject({
      pairing: null,
      held: [],
      others: { [UNKNOWN_PAIRING]: { held: ["n1"] } },
    })
    expect(step(unpaired, { kind: "paired", pairing: null })).toBe(unpaired)
    expect(step(unpaired, { kind: "paired", pairing: ANOTHER })).toMatchObject({
      pairing: ANOTHER,
      held: [],
    })
  })

  it("lists a note once when a pairing back again hears it held again, its first time kept", () => {
    const moved = copied(
      step(first, { kind: "paired", pairing: ANOTHER }),
      NOTE
    )
    const back = step(moved, { kind: "paired", pairing: PAIRING })
    const again = step(back, heldBy(PAIRING, "n1", "2026-12-01T00:00:00.000Z"))
    expect(again.held).toEqual(["n1"])
    expect(again.heldAt).toEqual({ n1: HEARD })
    expect(again.waiting).toEqual([OTHER])
  })

  it("reads back each pairing's word, and nothing else", () => {
    const moved = step(first, { kind: "paired", pairing: ANOTHER })
    expect(parseVoiceHome(JSON.stringify(moved))).toEqual(moved)
    for (const raw of [
      JSON.stringify({ ...moved, pairing: 7 }),
      JSON.stringify({ ...moved, others: [] }),
      JSON.stringify({ ...moved, others: { [PAIRING]: { held: [1] } } }),
      JSON.stringify({
        ...moved,
        others: { [PAIRING]: { held: [], heldAt: { n1: 1 } } },
      }),
    ]) {
      expect([raw, parseVoiceHome(raw)]).toEqual([raw, null])
    }
  })
})
