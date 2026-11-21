/**
 * What a bite is about (GWB18, #3049): the ranked list home sends, the
 * catalog's order without it, the unit a bite takes from it by default, the
 * one-tap change while it is said, and the fields home is sent once.
 */
import type { Said } from "@game-week/lib/bite"
import { biteFields } from "@game-week/lib/bite"
import type { Feed } from "@game-week/lib/feed"
import { readHome } from "@game-week/lib/live-wire"
import type { GameWeekState } from "@game-week/lib/machine"
import { rankedNow, step } from "@game-week/lib/machine"
import type { RankedEntry } from "@game-week/lib/ranked"
import { nextUnit, otherSide, rankedList, unitOf } from "@game-week/lib/ranked"
import { TIER_TITLES, unitLine, WORDS } from "@game-week/lib/words"
import { SCENARIOS, UNITS } from "@some-ui/game-scenarios"
import { describe, expect, it } from "vitest"

import { FEED, here, run, T0, take } from "./fixture"
import messages from "./game-live-messages.snapshot.json"

const RANKED: ReadonlyArray<RankedEntry> = [
  {
    scenario: "in.third-long",
    tier: "now",
    unit: { unit: "defense", side: "SEA" },
  },
  {
    scenario: "in.play-call",
    tier: "now",
    unit: { unit: "offense", side: "SF" },
  },
  { scenario: "you.caught-it", tier: "always", unit: null },
  {
    scenario: "in.fourth-down",
    tier: "rest",
    unit: { unit: "coaching", side: "SF" },
  },
]

const RANKED_FEED: Feed = {
  ...FEED,
  offer: FEED.offer === null ? null : { ...FEED.offer, ranked: RANKED },
}

const THIRD: Said = {
  how: "offered",
  scenario: "in.third-long",
  context: "3rd & 9 at the SEA 38",
}

function saying(said: Said, feed: Feed = RANKED_FEED): GameWeekState {
  return run(
    here(undefined, feed),
    { type: "say", said },
    { type: "micOpened", at: T0 + 100 }
  ).state
}

function fieldsKept(state: GameWeekState): Readonly<Record<string, string>> {
  const kept = run(
    state,
    { type: "done" },
    { type: "taken", take: take(), id: "b1", at: T0 + 5_000 }
  ).all.find((effect) => effect.type === "keep")
  if (kept?.type !== "keep") throw new Error("nothing kept")
  return kept.bite.fields
}

describe("the ranked list", () => {
  it("keeps a scenario home names twice where it first ranks it", () => {
    const twice = rankedList([
      ...RANKED,
      { scenario: "in.third-long", tier: "rest", unit: null },
    ])
    expect(twice.filter((e) => e.scenario === "in.third-long")).toEqual([
      RANKED[0],
    ])
  })

  it("is home's, then every scenario it left out, so each stays pickable once", () => {
    const list = rankedList(RANKED)
    expect(list.slice(0, RANKED.length)).toEqual(RANKED)
    expect(list.map((entry) => entry.scenario).sort()).toEqual(
      SCENARIOS.map((s) => s.id).sort()
    )
    expect(list.slice(RANKED.length).every((e) => e.tier === "rest")).toBe(true)
  })

  it("is every scenario in the catalog's order, with no unit, away from home", () => {
    for (const away of [null, []]) {
      const list = rankedList(away)
      expect(list.map((entry) => entry.scenario)).toEqual(
        SCENARIOS.map((s) => s.id)
      )
      expect(list.every((e) => e.tier === "rest" && e.unit === null)).toBe(true)
    }
  })

  it("is the current game's: another game's offer ranks nothing here", () => {
    const fed = here(undefined, RANKED_FEED)
    expect(rankedNow(fed)[0]).toEqual(RANKED[0])
    const other = run(fed, { type: "pickGame", gameId: "401772990" }).state
    expect(rankedNow(other)).toEqual(rankedList(null))
  })

  it("gives a scenario's unit, or none", () => {
    expect(unitOf(RANKED, "in.third-long")).toEqual(RANKED[0]?.unit)
    expect(unitOf(RANKED, "you.caught-it")).toBeNull()
    expect(unitOf(RANKED, "in.sack")).toBeNull()
  })
})

describe("a bite's unit", () => {
  it("is the ranked list's for its scenario, sent once with the bite", () => {
    const fields = fieldsKept(saying(THIRD))
    expect(fields).toMatchObject({ unit: "defense", unitSide: "SEA" })
  })

  it("stays as named when the person named one", () => {
    const named: Said = { ...THIRD, unit: { unit: "coaching", side: null } }
    const fields = fieldsKept(saying(named))
    expect(fields.unit).toBe("coaching")
    expect(fields).not.toHaveProperty("unitSide")
  })

  it("is none away from home, and none is sent", () => {
    const away: Feed = { ...FEED, offer: null, link: "away" }
    const fields = fieldsKept(saying(THIRD, away))
    expect(fields).not.toHaveProperty("unit")
    expect(fields).not.toHaveProperty("unitSide")
  })

  it("moves on with one tap while the bite is said, through none and back", () => {
    let state = saying(THIRD)
    const seen: Array<string> = []
    for (let i = 0; i <= UNITS.length; i++) {
      state = step(state, { type: "pickUnit" }).state
      const said = state.activity.kind === "taking" ? state.activity.said : null
      if (said === null || said.how === "said-first")
        throw new Error("not said")
      seen.push(
        said.unit == null
          ? "none"
          : `${said.unit.side ?? "no one"} ${said.unit.unit}`
      )
    }
    // From SEA defense: on to none, then back from the list's team.
    expect(seen).toEqual([
      "SEA special-teams",
      "SEA coaching",
      "none",
      "SEA offense",
      "SEA defense",
    ])
    const back = step(step(state, { type: "pickUnit" }).state, {
      type: "pickUnit",
    }).state
    expect(fieldsKept(back)).toMatchObject({
      unit: "coaching",
      unitSide: "SEA",
    })
    // Moved to none, nothing goes home.
    const none = step(back, { type: "pickUnit" }).state
    expect(fieldsKept(none)).not.toHaveProperty("unit")
  })

  it("switches to the game's other team with one tap, and back", () => {
    const once = step(saying(THIRD), { type: "switchSide" }).state
    const said = once.activity.kind === "taking" ? once.activity.said : null
    expect(said?.how !== "said-first" && said?.unit).toEqual({
      unit: "defense",
      side: "SF",
    })
    expect(fieldsKept(once)).toMatchObject({ unit: "defense", unitSide: "SF" })
    const twice = step(once, { type: "switchSide" }).state
    expect(fieldsKept(twice)).toMatchObject({ unitSide: "SEA" })
    // Of no one team, a switch makes it the home side's.
    expect(
      otherSide({ unit: "coaching", side: null }, { home: "SF", away: "SEA" })
    ).toEqual({ unit: "coaching", side: "SF" })
  })

  it("switches nothing without a unit, or a game home named the teams of", () => {
    const none = step(saying(THIRD), { type: "pickUnit" }).state
    const cleared = step(step(none, { type: "pickUnit" }).state, {
      type: "pickUnit",
    }).state
    expect(step(cleared, { type: "switchSide" }).state).toBe(cleared)
    const unnamed: Feed = {
      ...RANKED_FEED,
      games: RANKED_FEED.games.map(({ home: _h, away: _a, ...game }) => game),
    }
    const kept = saying(THIRD, unnamed)
    expect(step(kept, { type: "switchSide" }).state).toBe(kept)
  })

  it("can't be changed for a bite said first, or once it is kept", () => {
    const first = saying({ how: "said-first" })
    expect(step(first, { type: "pickUnit" }).state).toBe(first)
    const idle = here(undefined, RANKED_FEED)
    expect(step(idle, { type: "pickUnit" }).state).toBe(idle)
  })

  it("starts at the first unit, the list's team's or no one's, when there was none", () => {
    expect(nextUnit(null)).toEqual({ unit: UNITS[0], side: null })
    expect(nextUnit(null, "CHI")).toEqual({ unit: UNITS[0], side: "CHI" })
    expect(nextUnit({ unit: "coaching", side: "CHI" })).toBeNull()
  })

  it("for a bite said first, comes from the list as it stopped, not a newer one", () => {
    const asking = run(
      saying({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 }
    ).state
    // Home re-ranks after the stop: a turnover, SF now on defense.
    const newer: Feed = {
      ...RANKED_FEED,
      offer:
        RANKED_FEED.offer === null
          ? null
          : {
              ...RANKED_FEED.offer,
              seq: 42,
              ranked: [
                {
                  scenario: "in.third-long",
                  tier: "now",
                  unit: { unit: "defense", side: "SF" },
                },
              ],
            },
    }
    const answered = run(
      asking,
      { type: "fed", feed: newer },
      { type: "answer", said: THIRD }
    )
    const amend = answered.all.find((effect) => effect.type === "amend")
    expect(amend?.type === "amend" && amend.fields).toMatchObject({
      how: "said-first",
      scenario: "in.third-long",
      seq: "41",
      unit: "defense",
      unitSide: "SEA",
    })
  })

  it("is none for a bite said first and left for later", () => {
    const later = run(
      saying({ how: "said-first" }),
      { type: "done" },
      { type: "taken", take: take(), id: "b1", at: T0 + 5_000 },
      { type: "answer", said: null }
    ).all.find((effect) => effect.type === "amend")
    expect(later?.type === "amend" && later.fields).not.toHaveProperty("unit")
  })

  it("comes from the list for what just happened too", () => {
    const fields = fieldsKept(
      saying({ how: "just-happened", scenario: "in.play-call", context: "" })
    )
    expect(fields).toMatchObject({ unit: "offense", unitSide: "SF" })
  })

  it("is named by home's fields, and none when said first", () => {
    const moment = {
      gameId: "g",
      seq: null,
      strip: "",
      watching: true,
      mode: "standard" as const,
      offsetMs: null,
    }
    const unit = { unit: "special-teams" as const, side: "CHI" }
    expect(biteFields({ ...THIRD, unit }, moment, T0)).toMatchObject({
      unit: "special-teams",
      unitSide: "CHI",
    })
    expect(biteFields({ how: "said-first" }, moment, T0)).not.toHaveProperty(
      "unit"
    )
  })
})

describe("home's ranked list on the live socket", () => {
  const live = messages.home[0]!
  const withRanked = (ranked: unknown): string =>
    JSON.stringify({ ...live, offer: { ...live.offer, ranked } })

  it("reads each entry this build knows, and leaves the rest out", () => {
    const read = readHome(
      withRanked([
        {
          id: "in.third-long",
          tier: "now",
          unit: { unit: "defense", side: "CHI" },
        },
        { id: "you.caught-it", tier: "always", unit: null },
        { id: "in.added-later", tier: "rest", unit: null },
        { id: "in.sack", tier: "someday", unit: null },
        {
          id: "in.kick",
          tier: "rest",
          unit: { unit: "goalposts", side: null },
        },
        { id: "in.penalty", tier: "rest", unit: { unit: "coaching", side: 7 } },
        { id: "in.injury", tier: "rest", unit: { unit: "defense", side: "" } },
        {
          id: "in.fourth-down",
          tier: "rest",
          unit: { unit: "coaching", side: null },
        },
      ])
    )
    expect(read.kind === "offer" && read.offer?.ranked).toEqual([
      {
        scenario: "in.third-long",
        tier: "now",
        unit: { unit: "defense", side: "CHI" },
      },
      { scenario: "you.caught-it", tier: "always", unit: null },
      {
        scenario: "in.fourth-down",
        tier: "rest",
        unit: { unit: "coaching", side: null },
      },
    ])
  })

  it("reads an offer from a home before it ranks as one with no list", () => {
    const read = readHome(JSON.stringify(live))
    expect(read.kind === "offer" && read.offer).not.toHaveProperty("ranked")
  })
})

describe("the words for it", () => {
  it("name a unit by whose it is, in the person's terms", () => {
    expect(unitLine({ unit: "defense", side: "CHI" })).toBe("CHI defense")
    expect(unitLine({ unit: "special-teams", side: "SF" })).toBe(
      "SF special teams"
    )
    expect(unitLine({ unit: "coaching", side: null })).toBe("Coaching")
    expect(Object.values(TIER_TITLES)).toEqual([
      "Likely now",
      "Any time",
      "Everything else",
    ])
    expect(WORDS.unitChange).not.toMatch(/\bunit\b/i)
  })
})
