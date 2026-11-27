/** @vitest-environment node */
import type { Chips, Sorted } from "@soundbites/lib/library/compartments"
import {
  aboutBoth,
  aboutOfRef,
  chipCounts,
  compartmentCounts,
  holdsWords,
  inCompartment,
  kindsAsked,
  NO_CHIPS,
  ordered,
  toggled,
  topicOf,
  underChips,
  withGaps,
} from "@soundbites/lib/library/compartments"
import type { TakeTopic } from "@soundbites/lib/library/kinds"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { describe, expect, it } from "vitest"

const STATIONS = ["In the oven", "Cooking", "Ready for pickup", "Canned"]

const TAKES: ReadonlyArray<Sorted> = [
  { kind: "note", place: "home", station: "Cooking" },
  { kind: "note", place: "home", station: "Canned" },
  { kind: "note", place: "phone", station: null },
  { kind: "scene", place: "home", station: "Cooking" },
  { kind: "idea", place: "home", station: null },
  { kind: "here", place: "phone", station: null },
  { kind: "here", place: "home", station: "In the oven" },
]

describe("what a take's ref alone says it was for (TAKES2)", () => {
  it("reads each kind the phone sends home", () => {
    expect(aboutOfRef("idea:i1:what")).toEqual({
      kind: "idea",
      idea: null,
      question: "What's the video?",
    })
    // A question asked back is the idea's own: its ref can't say it.
    expect(aboutOfRef("idea:i1:ask-1")).toMatchObject({ question: null })
    expect(aboutOfRef("ask:some-ui-2876")).toEqual({
      kind: "ask",
      ask: null,
      number: 2876,
    })
    expect(aboutOfRef("week-8:intro:1").kind).toBe("scene")
    // A spoken card's part, by its card and part (#3339).
    expect(aboutOfRef("spoken:scabc12.2")).toEqual({
      kind: "spoken",
      card: "scabc12",
      title: null,
      part: 2,
    })
    // A take recorded on Takes, and a note's spoken part, go home alike.
    expect(aboutOfRef("take:abc").kind).toBe("here")
    expect(aboutOfRef("something else").kind).toBe("here")
  })
})

describe("what the build knows over what the ref says (TAKES2)", () => {
  it("fills each field the build knows, and keeps the ref's where it doesn't", () => {
    expect(
      aboutBoth(aboutOfRef("idea:i1:what"), {
        kind: "idea",
        idea: "Typing rounds",
        question: null,
      })
    ).toEqual({
      kind: "idea",
      idea: "Typing rounds",
      question: "What's the video?",
    })
    expect(aboutBoth(aboutOfRef("take:n1"), null)).toEqual({ kind: "here" })
    expect(
      aboutBoth(aboutOfRef("spoken:scabc12.0"), {
        kind: "spoken",
        card: "scabc12",
        title: "How I built Rust Rounds",
        part: 0,
      })
    ).toEqual({
      kind: "spoken",
      card: "scabc12",
      title: "How I built Rust Rounds",
      part: 0,
    })
  })

  it("groups a spoken card's takes by their card, named by its title or by what it is (#3339)", () => {
    const of = (card: string, title: string | null): TakeTopic | null =>
      topicOf({ kind: "spoken", card, title, part: 0 })
    expect(of("sca", "Intro")).toEqual({ key: "spoken:sca", label: "Intro" })
    expect(of("sca", null)?.key).toBe(of("sca", "Intro")?.key)
    expect(of("scb", null)).toEqual({
      key: "spoken:scb",
      label: LIBRARY_WORDS.aSpokenCard,
    })
  })

  it("takes the build's kind where the ref can't tell it: a note's take", () => {
    const note = {
      kind: "note",
      feed: "The weekly call",
      episode: "Week of Nov 6",
      atMs: 0,
      picks: [],
    } as const
    expect(aboutBoth(aboutOfRef("take:n1"), note)).toBe(note)
  })
})

describe("the compartments and their chips (TAKES3)", () => {
  it("counts each compartment, and all of them", () => {
    expect(compartmentCounts(TAKES)).toEqual({
      note: 3,
      scene: 1,
      idea: 1,
      ask: 0,
      spoken: 0,
      here: 2,
      bite: 0,
      round: 0,
      interview: 0,
      reflection: 0,
      jobs: 0,
      drama: 0,
      soundbite: 0,
      lens: 0,
      hunch: 0,
      leetype: 0,
      other: 0,
      all: 7,
    })
  })

  it("leaves out a chip that would show nothing, and orders stations along the conveyor", () => {
    const { places, stations } = chipCounts(TAKES, "note", NO_CHIPS, STATIONS)
    expect(places).toEqual([
      { chip: "phone", count: 1 },
      { chip: "home", count: 2 },
    ])
    expect(stations).toEqual([
      { chip: "Cooking", count: 1 },
      { chip: "Canned", count: 1 },
    ])
  })

  it("counts each chip under the other group's chip, so a tap shows what it said", () => {
    const every: ReadonlyArray<Chips> = [
      NO_CHIPS,
      { place: "home", station: null },
      { place: "phone", station: null },
      { place: null, station: "Cooking" },
      { place: "home", station: "Canned" },
    ]
    for (const compartment of ["all", "note", "here"] as const) {
      for (const chips of every) {
        const counts = chipCounts(TAKES, compartment, chips, STATIONS)
        const shown = (after: Chips): number =>
          TAKES.filter(
            (take) =>
              inCompartment(take, compartment) && underChips(take, after)
          ).length
        for (const { chip, count } of counts.places) {
          expect(count).toBe(shown({ ...chips, place: chip }))
        }
        for (const { chip, count } of counts.stations) {
          expect(count).toBe(shown({ ...chips, station: chip }))
        }
      }
    }
  })

  it("keeps a picked chip that shows nothing, so it can be let go", () => {
    const { stations } = chipCounts(
      TAKES,
      "idea",
      { place: null, station: "Cooking" },
      STATIONS
    )
    expect(stations).toEqual([{ chip: "Cooking", count: 0 }])
  })

  it("picks a chip on a tap, and lets it go on the next", () => {
    const home = toggled(NO_CHIPS, { group: "place", value: "home" })
    expect(home).toEqual({ ...NO_CHIPS, place: "home" })
    const cooking = toggled(home, { group: "station", value: "Cooking" })
    expect(cooking).toEqual({ ...NO_CHIPS, place: "home", station: "Cooking" })
    expect(toggled(cooking, { group: "place", value: "home" })).toEqual({
      ...NO_CHIPS,
      place: null,
      station: "Cooking",
    })
    expect(toggled(home, { group: "place", value: "phone" }).place).toBe(
      "phone"
    )
  })
})

describe("one home for every take: its chips, its order and its search", () => {
  const GAME = { key: "401772", label: "49ers vs Rams" }
  const WEEK = { key: "2026-w47", label: "Week 47" }
  const EVERY: ReadonlyArray<Sorted & { readonly at: string }> = [
    {
      kind: "bite",
      place: "home",
      station: null,
      topic: GAME,
      status: "heard",
      at: "2026-11-16T20:00:00Z",
    },
    {
      kind: "bite",
      place: "phone",
      station: null,
      topic: GAME,
      status: "waiting",
      at: "2026-11-16T21:00:00Z",
    },
    {
      kind: "interview",
      place: "home",
      station: null,
      topic: WEEK,
      status: "aside",
      at: "2026-11-17T09:00:00Z",
    },
    {
      kind: "reflection",
      place: "home",
      station: null,
      topic: null,
      status: "silent",
      at: "2026-11-15T09:00:00Z",
    },
    {
      kind: "note",
      place: "home",
      station: "Cooking",
      at: "2026-11-14T09:00:00Z",
    },
  ]

  it("counts every chip of every group under the others, so a tap shows what it said", () => {
    const every: ReadonlyArray<Chips> = [
      NO_CHIPS,
      { ...NO_CHIPS, kind: "bite" },
      { ...NO_CHIPS, topic: GAME },
      { ...NO_CHIPS, status: "waiting" },
      { ...NO_CHIPS, place: "home", topic: WEEK },
    ]
    for (const compartment of ["all", "bite", "interview"] as const) {
      for (const chips of every) {
        const groups = chipCounts(EVERY, compartment, chips, STATIONS)
        const shown = (after: Chips): number =>
          EVERY.filter(
            (take) =>
              inCompartment(take, compartment) && underChips(take, after)
          ).length
        for (const { chip, count } of groups.kinds) {
          expect(count).toBe(shown({ ...chips, kind: chip }))
        }
        for (const { chip, count } of groups.topics) {
          expect(count).toBe(shown({ ...chips, topic: chip }))
        }
        for (const { chip, count } of groups.statuses) {
          expect(count).toBe(shown({ ...chips, status: chip }))
        }
      }
    }
  })

  it("offers kinds as chips in All alone, and each topic once, by its words", () => {
    const all = chipCounts(EVERY, "all", NO_CHIPS, STATIONS)
    expect(all.kinds.map(({ chip }) => chip)).toEqual([
      "note",
      "bite",
      "interview",
      "reflection",
    ])
    expect(all.topics).toEqual([
      { chip: GAME, count: 2 },
      { chip: WEEK, count: 1 },
    ])
    expect(chipCounts(EVERY, "bite", NO_CHIPS, STATIONS).kinds).toEqual([])
  })

  it("orders newest, oldest, or by what each is about, those about nothing last", () => {
    const at = (take: { readonly at: string }): string => take.at
    expect(ordered(EVERY, "newest", at).map(at)[0]).toBe("2026-11-17T09:00:00Z")
    expect(ordered(EVERY, "oldest", at).map(at)[0]).toBe("2026-11-14T09:00:00Z")
    expect(
      ordered(EVERY, "topic", at).map((take) => take.topic?.label ?? null)
    ).toEqual(["49ers vs Rams", "49ers vs Rams", "Week 47", null, null])
  })

  it("finds a take by every word asked, in what home heard or what it is about", () => {
    expect(holdsWords(["49ers vs Rams", "Fourth down"], "rams fourth")).toBe(
      true
    )
    expect(holdsWords(["49ers vs Rams"], "rams punt")).toBe(false)
    expect(holdsWords([], "  ")).toBe(true)
  })

  it("names what each of Studio's kinds is about, for its chip", () => {
    expect(topicOf({ kind: "scene", video: "Week 8", scene: 1 })).toEqual({
      key: "Week 8",
      label: "Week 8",
    })
    expect(topicOf({ kind: "here" })).toBeNull()
    expect(topicOf({ kind: "bite", topic: GAME, parts: [] })).toBe(GAME)
  })
})

describe("what home is asked for, by compartment", () => {
  it("asks for Studio's kinds as one, each other kind as its own, and every kind in All", () => {
    expect(kindsAsked("note", null)).toEqual(["studio"])
    expect(kindsAsked("bite", null)).toEqual(["game"])
    expect(kindsAsked("interview", null)).toEqual(["interview"])
    expect(kindsAsked("round", null)).toEqual(["rust-round"])
    expect(kindsAsked("all", null)).toBeNull()
    expect(kindsAsked("all", "drama")).toEqual(["scene"])
    expect(kindsAsked("other", null)).toBeNull()
  })

  it("keeps a picked topic's chip though no take read has it, so it can be let go", () => {
    const picked = { key: "game:1", label: "NE @ CHI", asks: true }
    const { topics } = chipCounts(
      [],
      "bite",
      { ...NO_CHIPS, topic: picked },
      []
    )
    expect(topics).toEqual([{ chip: picked, count: 0 }])
    expect(
      toggled({ ...NO_CHIPS, topic: picked }, { group: "topic", value: picked })
        .topic
    ).toBeNull()
  })
})

describe("what a topic holds with no take, among its takes", () => {
  // A short label stands for an hour of one day; a full time for itself.
  const iso = (when: string): string =>
    when.length === 1 ? `2026-11-16T0${when}:00:00Z` : when
  const at = (row: string): string => iso(row)
  const gap = (when: string): { at: string; label: string } => ({
    at: iso(when),
    label: when,
  })
  const shape = (
    listed: ReadonlyArray<
      | { kind: "take"; row: string }
      | { kind: "gap"; gap: { at: string; label: string } }
    >
  ): ReadonlyArray<string> =>
    listed.map((each) =>
      each.kind === "take" ? `take ${each.row}` : `gap ${each.gap.label}`
    )

  it("places each gap by when it was, newest or oldest first as the takes are", () => {
    const gaps = [gap("2"), gap("5"), gap("0")]
    expect(shape(withGaps(["4", "1"], gaps, "newest", at, true))).toEqual([
      "gap 5",
      "take 4",
      "gap 2",
      "take 1",
      "gap 0",
    ])
    expect(shape(withGaps(["1", "4"], gaps, "oldest", at, true))).toEqual([
      "gap 0",
      "take 1",
      "gap 2",
      "take 4",
      "gap 5",
    ])
    // By topic, the takes share one: newest first.
    expect(shape(withGaps(["4", "1"], gaps, "topic", at, true))).toEqual(
      shape(withGaps(["4", "1"], gaps, "newest", at, true))
    )
  })

  it("shows no gap while older takes aren't shown yet, since its take may be among them", () => {
    // A bite can be said before its play, so neither order is safe.
    expect(
      shape(withGaps(["4", "1"], [gap("5"), gap("2")], "newest", at, false))
    ).toEqual(["take 4", "take 1"])
    expect(
      shape(withGaps(["1", "4"], [gap("0"), gap("2")], "oldest", at, false))
    ).toEqual(["take 1", "take 4"])
    expect(shape(withGaps([], [gap("5")], "newest", at, false))).toEqual([])
  })

  it("places by the instant, whatever fraction each time is written with", () => {
    expect(
      shape(
        withGaps(
          ["2026-10-23T01:10:00.500Z"],
          [gap("2026-10-23T01:10:00Z")],
          "newest",
          at,
          true
        )
      )
    ).toEqual(["take 2026-10-23T01:10:00.500Z", "gap 2026-10-23T01:10:00Z"])
  })

  it("lists every gap when there is no take, and a gap after a take of its moment", () => {
    expect(
      shape(withGaps([], [gap("1"), gap("3")], "newest", at, true))
    ).toEqual(["gap 3", "gap 1"])
    expect(shape(withGaps(["3"], [gap("3")], "oldest", at, true))).toEqual([
      "take 3",
      "gap 3",
    ])
    expect(withGaps(["2", "1"], [], "newest", at, true)).toEqual([
      { kind: "take", row: "2" },
      { kind: "take", row: "1" },
    ])
  })
})
