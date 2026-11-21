/**
 * The home-switches page's words: each state reads as what home does, since
 * when and who said so, and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type {
  Refusal,
  SettingKey,
  SettingValue,
  SwitchesState,
} from "@/lib/home-switches/model"
import { SETTING_KEYS } from "@/lib/home-switches/model"
import {
  changeFailed,
  GAME_TEAMS,
  PAGE,
  standingLine,
  statusLine,
  SWITCH_WORDS,
  type SettingWords,
} from "@/lib/home-switches/words"

const RUST_ROUNDS = SWITCH_WORDS["rust-rounds"]
const GAME_FEED = SWITCH_WORDS["game-feed"]

/** Names the store, the route or the variable behind the switch. */
const STORED =
  /\b(settings?|namespace|revision|operator|admin|default|env\w*|rust_rounds\w*|game_feed\w*|socket|runner|true|false)\b/i

const REFUSALS: ReadonlyArray<Refusal> = [
  "signed-out",
  "not-operator",
  "not-on-home",
  "refused",
  "unreachable",
  "no-home",
  "failed",
]

const AT = "2026-11-08T14:05:00.000Z"

const SETS = [
  null,
  { by: "owner", at: AT } as const,
  { by: "operator", at: AT } as const,
]

/** Every state setting `K` holding one of `values` can be in. */
function statesOf<K extends SettingKey>(
  values: ReadonlyArray<SettingValue[K]>
): Array<SwitchesState<K>> {
  const read = values.flatMap((value) =>
    SETS.flatMap((set) =>
      [null, ...values].map(
        (setting): SwitchesState<K> => ({
          kind: "read",
          standing: { value, set },
          setting,
        })
      )
    )
  )
  return [
    { kind: "reading" },
    ...REFUSALS.map((why): SwitchesState<K> => ({ kind: "unread", why })),
    ...read,
  ]
}

/** Every line setting `key` can say, from each state and each failed change. */
function said<K extends SettingKey>(
  key: K,
  values: ReadonlyArray<SettingValue[K]>
): Array<string> {
  const words: SettingWords<SettingValue[K]> = SWITCH_WORDS[key]
  return [
    words.label,
    words.about,
    ...statesOf<K>(values).map((state) => statusLine(words, state, "UTC")),
    ...REFUSALS.flatMap((why) =>
      values.flatMap((value) => Object.values(changeFailed(words, why, value)))
    ),
  ]
}

const TEAMS: ReadonlyArray<ReadonlyArray<string>> = [[], ["SF"], ["SEA", "SF"]]

function everything(): Array<string> {
  return [
    ...Object.values(PAGE),
    ...said("rust-rounds", [true, false]),
    ...said("game-feed", [true, false]),
    ...said("game-teams", TEAMS),
    GAME_TEAMS.group,
    GAME_TEAMS.save,
  ]
}

describe("home switches' words", () => {
  it("never name the machinery", () => {
    const said = everything()
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
    expect(said.filter((text) => STORED.test(text))).toEqual([])
  })

  it("say how it stands, who changed it and when", () => {
    expect(standingLine(RUST_ROUNDS, { value: true, set: null })).toBe(
      "On, as home starts: nobody has changed it."
    )
    expect(
      standingLine(
        RUST_ROUNDS,
        { value: false, set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("Paused since 8 Nov 2026, 14:05, when you paused it.")
    expect(
      standingLine(
        RUST_ROUNDS,
        { value: true, set: { by: "operator", at: AT } },
        "UTC"
      )
    ).toBe(
      "On since 8 Nov 2026, 14:05, when another account home trusts turned it on."
    )
    expect(standingLine(GAME_FEED, { value: true, set: null })).toBe(
      "Following, as home starts: nobody has changed it."
    )
    expect(
      standingLine(
        GAME_FEED,
        { value: false, set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("Paused since 8 Nov 2026, 14:05, when you paused it.")
    expect(standingLine(GAME_TEAMS, { value: [], set: null })).toBe(
      "Every game, as home starts: nobody has changed it."
    )
    expect(
      standingLine(
        GAME_TEAMS,
        { value: ["SEA", "SF"], set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("SEA, SF since 8 Nov 2026, 14:05, when you chose these teams.")
    expect(
      standingLine(
        GAME_TEAMS,
        { value: [], set: { by: "owner", at: AT } },
        "UTC"
      )
    ).toBe("Every game since 8 Nov 2026, 14:05, when you chose every game.")
  })

  it("say a change on its way, and one that did not land", () => {
    const pausing: SwitchesState<"rust-rounds"> = {
      kind: "read",
      standing: { value: true, set: null },
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
    expect(
      statusLine<"game-teams">(GAME_TEAMS, {
        kind: "read",
        standing: { value: [], set: null },
        setting: ["SF"],
      })
    ).toBe("Saving the teams followed…")
    expect(changeFailed(GAME_TEAMS, "refused", ["SF"])).toEqual({
      title: "Home didn't confirm the teams followed.",
      description:
        "Home didn't take that change. Asking home how it stands now.",
    })
  })

  it("say every refusal differently", () => {
    const lines = REFUSALS.map((why) =>
      statusLine<"rust-rounds">(RUST_ROUNDS, { kind: "unread", why })
    )
    expect(new Set(lines).size).toBe(REFUSALS.length)
  })

  it("keep each setting's own words apart", () => {
    const labels = SETTING_KEYS.map((key) => SWITCH_WORDS[key].label)
    expect(new Set(labels).size).toBe(SETTING_KEYS.length)
  })
})
