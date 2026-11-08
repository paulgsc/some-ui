/**
 * The home-switches page's words: each state reads as what home does, since
 * when and who said so, and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Refusal, SwitchesState } from "@/lib/home-switches/model"
import {
  changeFailed,
  PAGE,
  RUST_ROUNDS,
  standingLine,
  statusLine,
} from "@/lib/home-switches/words"

/** Names the store, the route or the variable behind the switch. */
const STORED =
  /\b(settings?|namespace|revision|operator|admin|default|env\w*|rust_rounds\w*|socket|runner|true|false)\b/i

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
  ...[true, false].flatMap((recording) =>
    [
      null,
      { by: "owner", at: AT } as const,
      { by: "operator", at: AT } as const,
    ].flatMap((set) =>
      [null, true, false].map(
        (setting): SwitchesState => ({
          kind: "read",
          standing: { recording, set },
          setting,
        })
      )
    )
  ),
]

function everything(): Array<string> {
  return [
    ...Object.values(PAGE),
    ...Object.values(RUST_ROUNDS),
    ...STATES.map((state) => statusLine(state, "UTC")),
    ...REFUSALS.flatMap((why) =>
      [true, false].flatMap((recording) =>
        Object.values(changeFailed(why, recording))
      )
    ),
  ]
}

describe("home switches' words", () => {
  it("never name the machinery", () => {
    const said = everything()
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
    expect(said.filter((text) => STORED.test(text))).toEqual([])
  })

  it("say how it stands, who changed it and when", () => {
    expect(standingLine({ recording: true, set: null })).toBe(
      "On, as home starts: nobody has changed it."
    )
    expect(
      standingLine({ recording: false, set: { by: "owner", at: AT } }, "UTC")
    ).toBe("Paused since 8 Nov 2026, 14:05, when you paused it.")
    expect(
      standingLine({ recording: true, set: { by: "operator", at: AT } }, "UTC")
    ).toBe(
      "On since 8 Nov 2026, 14:05, when another account home trusts turned it on."
    )
  })

  it("say a change on its way, and one that did not land", () => {
    expect(
      statusLine({
        kind: "read",
        standing: { recording: true, set: null },
        setting: false,
      })
    ).toBe("Pausing recording…")
    expect(changeFailed("unreachable", false).title).toBe(
      "Recording wasn't paused."
    )
  })

  it("say every refusal differently", () => {
    const lines = REFUSALS.map((why) => statusLine({ kind: "unread", why }))
    expect(new Set(lines).size).toBe(REFUSALS.length)
  })
})
