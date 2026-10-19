/**
 * Practice's sharing words (LA11): each state reads as what is kept where,
 * and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import type { Shared } from "@/lib/home-link/consent-model"
import type { KeptRun, KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { PracticeFacts } from "@/lib/home-link/practice-words"
import * as words from "@/lib/home-link/practice-words"
import { practiceView } from "@/lib/home-link/practice-words"

/** What the person must never be told in: how it works, not what it does. */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|http\w*|https?:|\d{3}\b|token|queue|retry|null|undefined)\b|\.(lan|local|com)\b/i

const KEPT: Shared = new Map([
  ["sessions", { since: 0 }],
  ["shelf", { since: 0 }],
])
const NONE: Shared = new Map()
const ONLY_SESSIONS: Shared = new Map([["sessions", { since: 0 }]])

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
      { kind: "failed", why: "home answered 500 for /sessions" },
    ] satisfies Array<KeptRun>
  ).map((last) => ({ ...INITIAL_KEPT, last })),
]

function every(): Array<PracticeFacts> {
  const facts: Array<PracticeFacts> = []
  for (const shared of [NONE, KEPT, ONLY_SESSIONS]) {
    for (const held of [
      { sessions: 0, shelf: 0 },
      { sessions: 3, shelf: 1 },
    ]) {
      for (const paired of [true, false]) {
        for (const waiting of [0, 1, 4]) {
          for (const run of runs)
            facts.push({ shared, held, paired, waiting, run })
        }
      }
    }
  }
  return facts
}

const day = (): string => "18 Oct"

describe("Practice's sharing words", () => {
  it("never name the machinery", () => {
    const said = every().flatMap((facts) => {
      const view = practiceView(facts, day)
      return [view.word, view.line, view.rows.sessions, view.rows.shelf]
    })
    const fixed: Array<string> = Object.values(words).flatMap((value) =>
      typeof value === "string"
        ? [value]
        : typeof value === "object"
          ? Object.values(value).flatMap((v) =>
              typeof v === "string" ? [v] : []
            )
          : []
    )

    const named = [...said, ...fixed].filter((text) => MACHINERY.test(text))
    expect(fixed.length).toBeGreaterThan(3)
    expect(named).toEqual([])
    // Still finds what it is meant to: today's Settings lines would fail it.
    for (const old of [
      "Last sync: 10:42",
      "home answered 429",
      "Reads from home.lan",
    ]) {
      expect(MACHINERY.test(old)).toBe(true)
    }
  })

  it("says phone only until something has gone home", () => {
    const view = practiceView(
      {
        shared: NONE,
        held: { sessions: 0, shelf: 0 },
        paired: true,
        waiting: 2,
        run: INITIAL_KEPT,
      },
      day
    )
    expect(view.shape).toBe("phone")
    expect(view.rows.sessions).toBe("Only on this phone")
  })

  it("says partly on home once sent and not kept, or stopped", () => {
    const view = practiceView(
      {
        shared: NONE,
        held: { sessions: 3, shelf: 0 },
        paired: true,
        waiting: 0,
        run: INITIAL_KEPT,
      },
      day
    )
    expect(view.shape).toBe("partly")
    expect(view.rows.sessions).toBe(
      "3 sessions on home, sent once · new ones stay here"
    )
  })

  it("says on home, since when, when kept and nothing waits", () => {
    const view = practiceView(
      {
        shared: KEPT,
        held: { sessions: 3, shelf: 1 },
        paired: true,
        waiting: 0,
        run: { ...INITIAL_KEPT, last: { kind: "synced", at: 1 } },
      },
      day
    )
    expect(view).toMatchObject({ shape: "kept", word: "On home" })
    expect(view.rows.sessions).toBe(
      "Kept on home since 18 Oct · 3 sessions there"
    )
  })

  it("says home was busy, with what waits", () => {
    const view = practiceView(
      {
        shared: KEPT,
        held: { sessions: 3, shelf: 1 },
        paired: true,
        waiting: 2,
        run: { ...INITIAL_KEPT, last: { kind: "failed", why: "busy" } },
      },
      day
    )
    expect(view).toMatchObject({ shape: "trouble", word: "Home busy" })
    expect(view.line).toBe(
      "Home is busy right now. 2 sessions wait on this phone and go next time."
    )
  })
})
