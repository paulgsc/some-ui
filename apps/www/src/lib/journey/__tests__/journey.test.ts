/**
 * The closed set of journey states (`lib/journey`): each has one road, one
 * theme and one set of words, the words say what is where and since when in
 * the person's terms, and none of them names the machinery. Every state is
 * sampled, with each noun and with and without its times.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Journey, Noun } from "@/lib/journey"
import {
  everyState,
  iconLabel,
  journey,
  JOURNEY_IDS,
  journeySaid,
  mostUrgent,
  roadOf,
  roadSaid,
  stateTitle,
  STOP_NAMES,
  stopOf,
  themeOf,
  whenSaid,
} from "@/lib/journey"

const NOW = new Date("2026-10-24T21:30:00Z")
const NOUNS: ReadonlyArray<Noun> = ["it", "them"]

/** Every state, bare and with every detail its words can carry. */
const SAMPLES: ReadonlyArray<Journey> = JOURNEY_IDS.flatMap((id) => [
  journey(id),
  journey(id, {
    since: "2026-10-24T16:14:00Z",
    runDay: "2026-10-25",
    why: "voice",
  }),
  journey(id, {
    since: "2026-10-22T16:14:00Z",
    runDay: "2026-10-23",
    why: "not-kept",
    via: "drive",
  }),
])

describe("the journey states", () => {
  it("say nothing of the machinery, in any state or noun", () => {
    const said = SAMPLES.flatMap((j) =>
      NOUNS.flatMap((noun) => {
        const s = journeySaid(j, noun, NOW)
        return [s.title, s.line, iconLabel(s, noun), stateTitle(j.id, noun)]
      })
    )
    const fixed = [
      everyState,
      ...Object.values(STOP_NAMES),
      ...SAMPLES.map((j) => roadSaid(roadOf(j))),
    ]
    expect([...said, ...fixed].filter((text) => MACHINERY.test(text))).toEqual(
      []
    )
  })

  it("agree in number with what they're about", () => {
    const one = journeySaid(journey("sheet-unconfirmed"), "it", NOW).line
    const many = journeySaid(journey("sheet-unconfirmed"), "them", NOW).line
    expect(one).toBe(
      "Did it arrive in Drive? Until you say so, it stays on offer."
    )
    expect(many).toBe(
      "Did they arrive in Drive? Until you say so, they stay on offer."
    )
  })

  it("say since when, and which run", () => {
    const j = journey("missed-run", {
      since: "2026-10-24T16:14:00Z",
      runDay: "2026-10-25",
    })
    const { line } = journeySaid(j, "them", NOW)
    expect(line).toContain(whenSaid("2026-10-24T16:14:00Z", NOW))
    expect(line).toContain("the Oct 25 run")
  })

  it("give a different day its date, and today its time alone", () => {
    expect(whenSaid("2026-10-24T20:00:00Z", NOW)).not.toMatch(/Oct/)
    expect(whenSaid("2026-10-20T20:00:00Z", NOW)).toMatch(/Oct/)
  })

  it("draw a road with one way fewer than its stops, at the stop the icon shows", () => {
    for (const j of SAMPLES) {
      const road = roadOf(j)
      expect(road.marks).toHaveLength(road.stops.length)
      expect(road.legs).toHaveLength(road.stops.length - 1)
      expect(road.stops).toContain(stopOf(j.id))
      expect(road.stops[0]).toBe("phone")
      expect(road.stops.at(-1)).toBe("run")
    }
  })

  it("take Drive's road for a file read by way of Drive", () => {
    expect(roadOf(journey("read", { via: "drive" })).stops).toEqual([
      "phone",
      "drive",
      "run",
    ])
    expect(roadOf(journey("read")).stops).toEqual([
      "phone",
      "home",
      "mailbox",
      "run",
    ])
  })

  it("mark a stopped road, and only a stopped one, with a stop", () => {
    for (const id of JOURNEY_IDS) {
      const stopped = roadOf(journey(id)).marks.includes("stopped")
      expect(stopped).toBe(themeOf(id) === "stopped")
    }
  })

  it("pick what most needs the person, stopped first and read last", () => {
    const read = journey("read")
    const moving = journey("with-home")
    const waiting = journey("on-phone")
    const stopped = journey("missed-run")
    expect(mostUrgent([read, moving, waiting, stopped])).toBe(stopped)
    expect(mostUrgent([read, moving, waiting])).toBe(waiting)
    expect(mostUrgent([read, moving])).toBe(moving)
    expect(mostUrgent([])).toBeNull()
  })
})
