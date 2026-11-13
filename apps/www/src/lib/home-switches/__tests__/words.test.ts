/**
 * The home-switches page's words: each state reads as what home does, since
 * when and who said so, and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Refusal, SwitchesState } from "@/lib/home-switches/model"
import {
  changeFailed,
  GAME_FEED,
  PAGE,
  RUST_ROUNDS,
  standingLine,
  statusLine,
  SWITCH_WORDS,
} from "@/lib/home-switches/words"

/** Names the store, the route or the variable behind the switch. */
const STORED =
  /\b(settings?|namespace|revision|operator|admin|default|env\w*|rust_rounds\w*|game_feed\w*|socket|runner|true|false)\b/i

const REFUSALS: ReadonlyArray<Refusal> = [
  "signed-out",
  "not-operator",
  "not-on-home",
  "unreachable",
  "no-home",
  "failed",
]

const AT = "2026-11-08T14:05:00.000Z"

const STATES: ReadonlyArray<SwitchesState> = [
  { kind: "reading" },
  ...REFUSALS.map((why): SwitchesState => ({ kind: "unread", why })),
  ...[true, false].flatMap((on) =>
    [
      null,
      { by: "owner", at: AT } as const,
      { by: "operator", at: AT } as const,
    ].flatMap((set) =>
      [null, true, false].map(
        (setting): SwitchesState => ({
          kind: "read",
          standing: { on, set },
          setting,
        })
      )
    )
  ),
]

const WORDS = Object.values(SWITCH_WORDS)

function everything(): Array<string> {
  return [
    ...Object.values(PAGE),
    ...WORDS.flatMap((words) => [
      ...Object.values(words),
      ...STATES.map((state) => statusLine(words, state, "UTC")),
      ...REFUSALS.flatMap((why) =>
        [true, false].flatMap((on) =>
          Object.values(changeFailed(words, why, on))
        )
      ),
    ]),
  ]
}

describe("home switches' words", () => {
  it("never name the machinery", () => {
    const said = everything()
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
    expect(said.filter((text) => STORED.test(text))).toEqual([])
  })

  it("say how it stands, who changed it and when", () => {
    expect(standingLine(RUST_ROUNDS, { on: true, set: null })).toBe(
      "On, as home starts: nobody has changed it."
    )
    expect(
      standingLine(
        RUST_ROUNDS,
        { on: false, set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("Paused since 8 Nov 2026, 14:05, when you paused it.")
    expect(
      standingLine(
        RUST_ROUNDS,
        { on: true, set: { by: "operator", at: AT } },
        "UTC"
      )
    ).toBe(
      "On since 8 Nov 2026, 14:05, when another account home trusts turned it on."
    )
    expect(standingLine(GAME_FEED, { on: true, set: null })).toBe(
      "Following, as home starts: nobody has changed it."
    )
    expect(
      standingLine(
        GAME_FEED,
        { on: false, set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("Paused since 8 Nov 2026, 14:05, when you paused it.")
  })

  it("say a change on its way, and one that did not land", () => {
    const pausing: SwitchesState = {
      kind: "read",
      standing: { on: true, set: null },
      setting: false,
    }
    expect(statusLine(RUST_ROUNDS, pausing)).toBe("Pausing recording…")
    expect(statusLine(GAME_FEED, pausing)).toBe("Pausing following games…")
    expect(changeFailed(RUST_ROUNDS, "unreachable", false).title).toBe(
      "Home didn't confirm recording is paused."
    )
    expect(changeFailed(GAME_FEED, "unreachable", true).title).toBe(
      "Home didn't confirm it is following games."
    )
  })

  it("say every refusal differently", () => {
    for (const words of WORDS) {
      const lines = REFUSALS.map((why) =>
        statusLine(words, { kind: "unread", why })
      )
      expect(new Set(lines).size).toBe(REFUSALS.length)
    }
  })

  it("keep each switch's own words apart", () => {
    const labels = WORDS.map((words) => words.label)
    expect(new Set(labels).size).toBe(WORDS.length)
  })
})
