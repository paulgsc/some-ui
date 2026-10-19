/**
 * Each lane's sharing words (LA9 to LA11): each state reads as what is kept
 * where, and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import type { Shared } from "@/lib/home-link/consent-model"
import type { KeptRun, KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { LaneFacts } from "@/lib/home-link/words"
import * as words from "@/lib/home-link/words"
import { laneView, WORDS } from "@/lib/home-link/words"

/** What the person must never be told in: how it works, not what it does. */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|http\w*|https?:|\d{3}\b|token|queue|retry|null|undefined|lane|pull\w*|outbox)\b|\.(lan|local|com)\b/i

const ALL = { since: 0, earlier: false }
const KEPT: Shared = new Map([
  ["sessions", ALL],
  ["shelf", ALL],
  ["aph", ALL],
  ["jobs", { since: 0, earlier: true }],
])
const NONE: Shared = new Map()
const ONLY_SESSIONS: Shared = new Map([["sessions", ALL]])

const runs: Array<KeptState> = [
  INITIAL_KEPT,
  { ...INITIAL_KEPT, running: true },
  ...(
    [
      { kind: "synced", at: 1 },
      { kind: "unreachable", at: 1 },
      { kind: "stopped" },
      { kind: "busy" },
      { kind: "unpaired" },
      { kind: "forgotten" },
      { kind: "failed", why: "busy" },
      { kind: "failed", why: "full" },
      { kind: "failed", why: "refused" },
      { kind: "failed", why: "an entry: home answered 500" },
    ] satisfies Array<KeptRun>
  ).map((last) => ({ ...INITIAL_KEPT, last })),
]

const facts = (over: Partial<LaneFacts> = {}): LaneFacts => ({
  shared: NONE,
  stopped: new Map(),
  held: {},
  refused: {},
  waiting: 0,
  run: INITIAL_KEPT,
  away: null,
  hidden: 0,
  pulled: true,
  ...over,
})

function every(): Array<LaneFacts> {
  const all: Array<LaneFacts> = []
  for (const shared of [NONE, KEPT, ONLY_SESSIONS]) {
    for (const stopped of [new Map(), new Map([["aph", 5] as const])]) {
      for (const held of [{}, { sessions: 3, shelf: 1, jobs: 4 }]) {
        for (const away of [null, { waiting: 2, back: INITIAL_KEPT }]) {
          for (const run of runs) {
            all.push(
              facts({
                shared,
                stopped,
                held,
                refused: { shelf: 2, aph: 1, jobs: 1 },
                waiting: 3,
                run,
                away: away && { ...away, back: run },
                hidden: 1,
                pulled: false,
              })
            )
          }
        }
      }
    }
  }
  return all
}

const day = (): string => "18 Oct"

/** Every string in `value`, and what each of its counting words says of 2. */
function stringsOf(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((v: unknown) =>
      typeof v === "function" ? [String(v(2))] : stringsOf(v)
    )
  }
  return []
}

describe("each lane's sharing words", () => {
  it("never name the machinery", () => {
    const said = Object.values(WORDS).flatMap((lane) =>
      every().flatMap((f) => {
        const view = laneView(lane, f, day)
        return [
          view.word,
          view.line,
          ...view.rows.map((row) => row.text),
          ...view.notes,
        ]
      })
    )
    const fixed = Object.values(words).flatMap(stringsOf)

    const named = [...said, ...fixed].filter((text) => MACHINERY.test(text))
    expect(fixed.length).toBeGreaterThan(30)
    expect(named).toEqual([])
    // The pattern is not vacuous: each of these must match.
    for (const old of [
      "Last sync: 10:42",
      "home answered 429",
      "Reads from home.lan",
      "Until home.lan answers, this shows only what this phone hasn't sent.",
    ]) {
      expect(MACHINERY.test(old)).toBe(true)
    }
  })

  it("says phone only until something has gone home", () => {
    const view = laneView(WORDS.practice, facts({ waiting: 2 }), day)
    expect(view.shape).toBe("phone")
    expect(view.rows.map((row) => row.text)).toEqual([
      "Only on this phone",
      "Only on this phone",
    ])
  })

  it("says partly on home once sent and not kept", () => {
    const view = laneView(
      WORDS.practice,
      facts({ held: { sessions: 3, shelf: 0 } }),
      day
    )
    expect(view.shape).toBe("partly")
    expect(view.rows[0]?.text).toBe("3 sessions on home · new ones stay here")
  })

  it("says until when home was sent to, once stopped", () => {
    const view = laneView(
      WORDS.jobs,
      facts({ stopped: new Map([["jobs", 5]]), held: { jobs: 4 } }),
      day
    )
    expect(view.shape).toBe("partly")
    expect(view.rows[0]?.text).toBe(
      "Sent to home until 18 Oct · 4 events there · new ones stay here"
    )
  })

  it("says on home, since when, when kept and nothing waits", () => {
    const view = laneView(
      WORDS.practice,
      facts({
        shared: KEPT,
        held: { sessions: 3, shelf: 1 },
        refused: { shelf: 2 },
        run: { ...INITIAL_KEPT, last: { kind: "synced", at: 1 } },
      }),
      day
    )
    expect(view).toMatchObject({ shape: "kept", word: "On home" })
    expect(view.rows.map((row) => row.text)).toEqual([
      "Kept on home since 18 Oct · 3 sessions there",
      "Kept on home since 18 Oct · 1 kept item there · 2 kept items home didn't take",
    ])
  })

  it("says a choice found from before only that it was before", () => {
    const view = laneView(WORDS.jobs, facts({ shared: KEPT }), day)
    expect(view.rows[0]?.text).toBe("Kept on home since before 18 Oct")
  })

  it("says home was busy, with what waits, for every lane", () => {
    const busy = facts({
      shared: KEPT,
      waiting: 2,
      run: { ...INITIAL_KEPT, last: { kind: "failed", why: "busy" } },
    })
    expect(laneView(WORDS.practice, busy, day)).toMatchObject({
      shape: "trouble",
      word: "Home busy",
      line: "Home is busy right now. 2 sessions wait on this phone and go next time.",
    })
    expect(laneView(WORDS.aph, busy, day).line).toBe(
      "Home is busy right now. 2 changes wait on this phone and go next time."
    )
  })

  it("says aph is on home, and what this phone holds, once stopped short", () => {
    const away = facts({
      stopped: new Map([["aph", 5]]),
      away: {
        waiting: 2,
        back: { ...INITIAL_KEPT, last: { kind: "unreachable", at: 1 } },
      },
    })
    expect(laneView(WORDS.aph, away, day)).toMatchObject({
      shape: "trouble",
      line: "Home didn't answer. Sending to home is off. Home holds aph; this phone holds only the 2 changes home hadn't confirmed.",
    })
  })
})
