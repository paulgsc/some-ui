/** @vitest-environment node */
import type { Chips, Sorted } from "@soundbites/lib/library/compartments"
import {
  aboutBoth,
  aboutOfRef,
  chipCounts,
  compartmentCounts,
  inCompartment,
  NO_CHIPS,
  toggled,
  underChips,
} from "@soundbites/lib/library/compartments"
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
      here: 2,
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
    expect(home).toEqual({ place: "home", station: null })
    const cooking = toggled(home, { group: "station", value: "Cooking" })
    expect(cooking).toEqual({ place: "home", station: "Cooking" })
    expect(toggled(cooking, { group: "place", value: "home" })).toEqual({
      place: null,
      station: "Cooking",
    })
    expect(toggled(home, { group: "place", value: "phone" }).place).toBe(
      "phone"
    )
  })
})
