import { frictionOf, parseFriction } from "@video-render/friction"
import type { Friction, FrictionRegistry } from "@video-render/friction"
import sampleHome from "@video-render/templates/engagement-report/sample-weeks.json"
import { describe, expect, it } from "vitest"

/** A registry shaped as `@some-ui/engagement`'s, its places and roots as Jobs' and aph's are. */
const registry: FrictionRegistry = [
  {
    id: "jobs",
    opened: { kind: "root", affordance: "today" },
    affordances: [
      { id: "today", surface: "apk", offer: null, places: [{ id: "today" }] },
      {
        id: "todays-pick",
        surface: "apk",
        offer: "listed",
        places: [{ id: "read" }, { id: "apply" }, { id: "ending" }],
      },
      {
        id: "record",
        surface: "apk",
        offer: null,
        places: [{ id: "record" }],
      },
      {
        id: "interview-week",
        surface: "apk",
        offer: "listed",
        places: [{ id: "say" }, { id: "past" }],
      },
    ],
  },
  {
    id: "aph",
    opened: { kind: "root", affordance: "history" },
    affordances: [{ id: "history", surface: "apk", offer: "listed" }],
  },
  {
    id: "study",
    opened: { kind: "root", affordance: "nudge" },
    affordances: [{ id: "nudge", surface: "apk", offer: "notified" }],
  },
  { id: "bites", opened: { kind: "not-measured" }, affordances: [] },
]

const read = (raw: unknown = sampleHome): Friction => {
  const got = frictionOf(raw, registry)
  if (!got.ok) throw new Error(got.problems.join("\n"))
  return got.value
}

describe("the friction aggregate (WALK5, C861)", () => {
  it("reads home's weekly read: modules by their root shown on screen", () => {
    const { modules } = read()
    expect(modules).toEqual([
      {
        pipeline: "jobs",
        opened: { kind: "measured", days: 19, of: 28, weeksQuiet: 0 },
      },
      {
        pipeline: "aph",
        opened: {
          kind: "measured",
          days: "fewer-than-5",
          of: 28,
          weeksQuiet: 6,
        },
      },
      // A root sent as a notification counts notifications, not openings.
      { pipeline: "study", opened: { kind: "not-measured" } },
      { pipeline: "bites", opened: { kind: "not-measured" } },
    ])
  })

  it("bounds a root's days by its first, and never calls one quiet it holds nothing of", () => {
    const late = {
      ...sampleHome,
      seen: sampleHome.seen.map((s) =>
        s.affordance === "today" ? { ...s, firstDay: "2026-11-06" } : s
      ),
    }
    expect(read(late).modules[0]?.opened).toMatchObject({ of: 10 })
    const unseen = {
      ...sampleHome,
      seen: sampleHome.seen.filter((s) => s.pipeline !== "aph"),
    }
    expect(read(unseen).modules[1]?.opened).toEqual({ kind: "not-measured" })
    const { lastOpenedDay: _, ...kept } = sampleHome.seen[0]!
    const before = { ...sampleHome, seen: [kept, ...sampleHome.seen.slice(1)] }
    expect(read(before).modules[1]?.opened).toEqual({ kind: "not-measured" })
  })

  it("hides opened days against the days measured, not the window", () => {
    const late = {
      ...sampleHome,
      seen: sampleHome.seen.map((s) =>
        s.affordance === "today" ? { ...s, firstDay: "2026-11-06" } : s
      ),
      friction: {
        ...sampleHome.friction,
        opened: sampleHome.friction.opened.map((o) =>
          o.pipeline === "jobs" && o.affordance === "today"
            ? { ...o, days: 6 }
            : o
        ),
      },
    }
    expect(read(late).modules[0]?.opened).toMatchObject({
      of: 10,
      days: "no-data",
    })
  })

  it("leaves a root's opened days unsaid where the days it wasn't opened would be under 5 (C938)", () => {
    const openedOn = (days: number): unknown => {
      const home = {
        ...sampleHome,
        friction: {
          ...sampleHome.friction,
          opened: sampleHome.friction.opened.map((o) =>
            o.pipeline === "jobs" && o.affordance === "today"
              ? { ...o, days }
              : o
          ),
        },
      }
      const opened = read(home).modules[0]?.opened
      return opened?.kind === "measured" ? opened.days : opened?.kind
    }
    expect(openedOn(26)).toBe("no-data")
    expect(openedOn(28)).toBe("no-data")
    expect(openedOn(24)).toBe("no-data")
    expect(openedOn(23)).toBe(23)
  })

  it("lists every place, moved on unknown at the last, nothing where nothing was seen", () => {
    const { places, debrief } = read()
    const at = (
      affordance: string,
      place: string
    ): Friction["places"][number] | undefined =>
      places.find((p) => p.affordance === affordance && p.place === place)
    expect(at("todays-pick", "read")).toEqual({
      pipeline: "jobs",
      affordance: "todays-pick",
      place: "read",
      stretchesLeft: 20,
      movedOn: 14,
      medianMs: 41000,
    })
    expect(at("todays-pick", "apply")).toMatchObject({
      stretchesLeft: 7,
      movedOn: "fewer-than-5",
    })
    // 9 stretches, 5 moved on from: saying both would give away the 4 not.
    expect(at("interview-week", "say")).toMatchObject({
      stretchesLeft: 9,
      movedOn: "no-data",
    })
    expect(at("todays-pick", "ending")).toMatchObject({
      stretchesLeft: "fewer-than-5",
      movedOn: "no-data",
      medianMs: null,
    })
    expect(at("record", "record")).toMatchObject({
      stretchesLeft: "no-data",
      movedOn: "no-data",
    })
    expect(debrief).toEqual({ said: "fewer-than-5", median: null })
  })

  it("says no place's counts from a part of the window", () => {
    const partial = {
      ...sampleHome,
      friction: { ...sampleHome.friction, partial: true },
    }
    for (const p of read(partial).places)
      expect([p.stretchesLeft, p.movedOn]).toEqual(["no-data", "no-data"])
  })

  it("refuses a week kept before home measured friction", () => {
    const { friction: _, ...before } = sampleHome
    const got = frictionOf(before, registry)
    expect(got.ok ? [] : got.problems).toEqual([
      "2026-W46 was kept before home measured friction",
    ])
  })

  it("refuses a count under 5 said as a number, a median under 5, and a module or place twice", () => {
    const value = read()
    const { modules, places } = value
    const [first] = places
    expect(
      parseFriction({ ...value, places: [{ ...first, stretchesLeft: 3 }] }).ok
    ).toBe(false)
    const thin = parseFriction({
      ...value,
      places: [{ ...first, stretchesLeft: "fewer-than-5", medianMs: 4000 }],
      debrief: { said: "fewer-than-5", median: 3 },
    })
    expect(thin.ok ? [] : thin.problems).toEqual([
      "jobs/today/today: a median over fewer than 5",
      "debrief: a median over fewer than 5",
    ])
    const twice = parseFriction({
      ...value,
      modules: [...modules, ...modules.slice(0, 1)],
      places: [...places, ...places.slice(0, 1)],
    })
    expect(twice.ok ? [] : twice.problems).toEqual([
      "jobs: listed twice",
      "jobs/today/today: listed twice",
    ])
  })
})
