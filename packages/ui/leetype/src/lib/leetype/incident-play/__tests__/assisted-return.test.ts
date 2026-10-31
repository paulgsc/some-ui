/**
 * LTY1 (#2029, #2343, canon Rem. 9.5, Rem. 11.10): a return counts as
 * solving its round only when nothing showed the round's answer, a take's
 * rubric that covers it or the round's own worked confirmation, between the
 * round's last struggle and the return. On the ledger screen any correct,
 * unhurried return unparks the round, assisted or not; the reports count an
 * assisted one as assisted, not solved.
 *
 * The Family, played end to end on the runtime into the log and read back
 * by `ledgerOf` and `summariesOf`:
 *
 * - every order of a struggle that parks the round (S), the answer shown
 *   (T) and a return of the round (R) in which the return follows a
 *   struggle (`STR`, `SRT`, `TSR`), and three that test how long
 *   assistance lasts: a second struggle after T (`STSR`), a second return
 *   (`STRR`), and a fresh struggle after an assisted return (`STRSR`);
 * - what showed it: a take's rubric whose coverage is known and names the
 *   round, known and names another round, or unknown (no point says
 *   `covers`, read as every round parked in the session that shows it);
 *   the round's own worked confirmation; another round's;
 * - how: a rubric after a typed answer, after a pass, or as a parked take's
 *   worked confirmation; a round's confirmation on its struggle's reveal;
 *   either confirmation at a round boundary or from the first screen
 *   (Prop. 9.4 (d));
 * - the session each step falls in: every split of the order into
 *   sessions.
 *
 * Only what the phone can offer is played: a confirmation from the parked
 * list needs its round or take parked, the first screen comes before any
 * step of its session, and a reveal's confirmation follows its struggle.
 * The oracle is the claim.
 */
import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { SessionLog } from "@leetype/lib/leetype/session-log/model"
import { ledgerOf, summariesOf } from "@leetype/lib/leetype/session-log/model"
import type { SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

type Coverage = "names-it" | "names-another" | "unknown"
type What = Coverage | "its-confirmation" | "another's-confirmation"
type How =
  | "typed"
  | "passed"
  | "at-the-reveal"
  | "at-a-boundary"
  | "from-the-first-screen"

const FILE_NAME = "lty1.json"

/** The hub's actions, by index. */
const HUB = { round: 0, take: 1, return: 2, done: 3, other: 4 } as const

const POINTS: Record<Coverage, ReadonlyArray<unknown>> = {
  "names-it": [
    { text: "The write needs a majority", covers: ["r1"] },
    { text: "Say why", covers: [] },
  ],
  "names-another": [
    { text: "The write needs a majority", covers: ["r2"] },
    { text: "Say why", covers: [] },
  ],
  unknown: ["The write needs a majority", "Say why"],
}

const choice = (next: string): Record<string, unknown> => ({
  type: "choice",
  options: [
    { label: "Right", next, correct: true },
    { label: "Wrong", next },
    { label: "Not sure", next, abstain: true },
  ],
})

/**
 * A hub every step starts and ends at: the round r1, its return r1b, a
 * take t1 whose rubric has the coverage asked, and r2, another round.
 */
function fileWith(coverage: Coverage): SessionFile {
  return SessionFileSchema.parse({
    title: "LTY1",
    oneLine: "Struggle, answer shown and return in every order.",
    session: { kind: "incident", budgetMinutes: 30 },
    start: "hub",
    screens: {
      hub: {
        type: "info",
        actions: [
          { label: "Round", next: "r1" },
          { label: "Take", next: "t1" },
          { label: "Return", next: "r1b" },
          { label: "Done" },
          { label: "Another round", next: "r2" },
        ],
      },
      r1: choice("hub"),
      r1b: { ...choice("hub"), returnOf: "r1" },
      r2: choice("hub"),
      t1: {
        type: "record",
        prompt: "Why did the write not stick?",
        maxSeconds: 60,
        rubric: POINTS[coverage],
        weakIfFewerThan: 0,
        next: "hub",
      },
    },
  })
}

type Token =
  | { readonly kind: "S" }
  | { readonly kind: "R" }
  | { readonly kind: "|" }
  /** A struggle on r2, so its confirmation is offered. */
  | { readonly kind: "S2" }
  | { readonly kind: "T"; readonly what: What; readonly how: How }

/** The screen whose confirmation a confirmation `what` takes. */
function confirmed(what: What): string {
  switch (what) {
    case "its-confirmation": {
      return "r1"
    }
    case "another's-confirmation": {
      return "r2"
    }
    case "names-it":
    case "names-another":
    case "unknown": {
      return "t1"
    }
    default: {
      return assertNever(what)
    }
  }
}

/**
 * Plays `script` on `file`, a new session at each `|`, and returns the log
 * and the last session's id.
 */
function play(
  file: SessionFile,
  script: ReadonlyArray<Token>
): { log: SessionLog; last: string } {
  const log = createSessionLogStore(memoryStorage())
  let now = Date.parse("2026-10-31T09:00:00.000Z")
  let id = 0
  const ports = {
    log,
    now: (): number => (now += 1000),
    newId: (): string => `id${String(++id)}`,
  }
  let runtime = new IncidentPlayRuntime(ports)
  const at = (): string | undefined => runtime.getSnapshot().play?.screen
  // Starts the session in hand unless it has started.
  const start = (): void =>
    runtime.start({ fileName: FILE_NAME, file, form: "full" })
  const act = (action: number): void =>
    runtime.dispatch({ type: "act", action })
  const struggle = (action: number, confirm: boolean): void => {
    act(action)
    runtime.dispatch({ type: "pick", option: 1 })
    if (confirm) runtime.dispatch({ type: "show-confirmation" })
    runtime.dispatch({ type: "continue" })
  }
  script.forEach((token, index) => {
    if (token.kind === "|") {
      start()
      act(HUB.done)
      expect(runtime.getSnapshot().play?.ended).toBe("declared")
      runtime = new IncidentPlayRuntime(ports)
      return
    }
    if (token.kind === "T" && token.how === "from-the-first-screen") {
      if (at() !== undefined) {
        throw new Error("the first screen is before any step")
      }
      runtime.takeConfirmation(FILE_NAME, file, confirmed(token.what))
      return
    }
    start()
    if (token.kind === "T" && token.how === "at-the-reveal") {
      // Taken on the reveal of the struggle just played.
      return
    }
    expect(at()).toBe("hub")
    switch (token.kind) {
      case "S": {
        const next = script[index + 1]
        struggle(HUB.round, next?.kind === "T" && next.how === "at-the-reveal")
        break
      }
      case "S2": {
        struggle(HUB.other, false)
        break
      }
      case "R": {
        act(HUB.return)
        runtime.dispatch({ type: "pick", option: 0 })
        runtime.dispatch({ type: "continue" })
        break
      }
      case "T": {
        if (token.how === "at-a-boundary") {
          runtime.takeConfirmation(FILE_NAME, file, confirmed(token.what))
          break
        }
        act(HUB.take)
        runtime.dispatch(
          token.how === "passed"
            ? { type: "pass" }
            : {
                type: "answered",
                answer: { as: "typed", text: "A typed one." },
              }
        )
        runtime.dispatch({ type: "ticked", ticks: [] })
        break
      }
      default: {
        assertNever(token)
      }
    }
    expect(at()).toBe("hub")
  })
  start()
  const kept = log.getSnapshot()
  expect(kept.problem).toBeNull()
  const last = kept.log.at(-1)?.session ?? ""
  return { log: kept.log, last }
}

/** Whether each return in `script` is assisted, by the claim. */
function oracle(script: ReadonlyArray<Token>): Array<boolean> {
  const expected: Array<boolean> = []
  let assisted = false
  let parkedThisSession = false
  for (const token of script) {
    if (token.kind === "|") parkedThisSession = false
    if (token.kind === "S") {
      // What was shown before this struggle did not keep it from struggling.
      assisted = false
      parkedThisSession = true
    }
    if (token.kind === "T") {
      assisted ||=
        token.what === "names-it" ||
        token.what === "its-confirmation" ||
        (token.what === "unknown" && parkedThisSession)
    }
    if (token.kind === "R") expected.push(assisted)
  }
  return expected
}

const ORDERS = ["STR", "SRT", "TSR", "STSR", "STRR", "STRSR"] as const

/** The ways the phone can show an answer, by what shows it. */
const WAYS: ReadonlyArray<{ readonly what: What; readonly how: How }> = [
  ...(["names-it", "names-another", "unknown"] as const).flatMap((what) =>
    (
      ["typed", "passed", "at-a-boundary", "from-the-first-screen"] as const
    ).map((how) => ({ what, how }))
  ),
  ...(["at-the-reveal", "at-a-boundary", "from-the-first-screen"] as const).map(
    (how) => ({ what: "its-confirmation" as const, how })
  ),
  ...(["at-a-boundary", "from-the-first-screen"] as const).map((how) => ({
    what: "another's-confirmation" as const,
    how,
  })),
]

/** `order` with a session break, or none, in each gap between its steps. */
function splits(order: string): Array<string> {
  const steps = [...order]
  const gaps = steps.length - 1
  return Array.from({ length: 2 ** gaps }, (_, mask) =>
    steps
      .map((one, index) =>
        index < gaps && mask & (2 ** index) ? `${one}|` : one
      )
      .join("")
  )
}

function tokenOf(one: string, what: What, how: How): Token {
  switch (one) {
    case "T": {
      return { kind: "T", what, how }
    }
    case "S": {
      return { kind: "S" }
    }
    case "R": {
      return { kind: "R" }
    }
    case "|": {
      return { kind: "|" }
    }
    default: {
      throw new Error(`"${one}" is no step`)
    }
  }
}

/** Whether the phone offers each `T` in `tokens` where it stands. */
function playable(tokens: ReadonlyArray<Token>): boolean {
  let parked = false
  return tokens.every((token, index) => {
    const before = tokens[index - 1]
    if (token.kind === "S") parked = true
    if (token.kind === "R") parked = false
    if (token.kind !== "T") return true
    if (
      token.how === "from-the-first-screen" &&
      !(index === 0 || before?.kind === "|")
    ) {
      return false
    }
    if (token.how === "at-the-reveal") return before?.kind === "S"
    // The parked list offers r1's confirmation only while r1 is parked.
    return token.what !== "its-confirmation" || parked
  })
}

function scriptOf(split: string, what: What, how: How): Array<Token> | null {
  const tokens = [...split].map((one) => tokenOf(one, what, how))
  if (!playable(tokens)) return null
  // A confirmation from the parked list needs its take or round parked.
  const fromList = how === "at-a-boundary" || how === "from-the-first-screen"
  if (fromList && what === "another's-confirmation") {
    return [{ kind: "S2" }, { kind: "|" }, ...tokens]
  }
  if (fromList && what !== "its-confirmation") {
    return [{ kind: "T", what, how: "passed" }, { kind: "|" }, ...tokens]
  }
  return tokens
}

const FAMILY = WAYS.flatMap(({ what, how }) =>
  ORDERS.flatMap((order) =>
    splits(order).flatMap((split) => {
      const script = scriptOf(split, what, how)
      return script === null ? [] : [{ what, how, split, script }]
    })
  )
)

describe("LTY1: a return after anything that showed its answer is assisted", () => {
  it("enumerates every member of the Family the phone can play", () => {
    const count = (what: What, how: How): number =>
      FAMILY.filter((one) => one.what === what && one.how === how).length
    // Splits: 4 each of STR, SRT and TSR, 8 each of STSR and STRR, 16 of
    // STRSR: 44. The first screen keeps those where a session opens with T.
    expect(count("names-it", "typed")).toBe(44)
    expect(count("names-it", "from-the-first-screen")).toBe(24)
    // A reveal's confirmation needs T right after S in the same session; the
    // parked list's needs r1 parked, so never after a return.
    expect(count("its-confirmation", "at-the-reveal")).toBe(18)
    expect(count("its-confirmation", "at-a-boundary")).toBe(36)
    expect(count("its-confirmation", "from-the-first-screen")).toBe(18)
    expect(count("another's-confirmation", "at-a-boundary")).toBe(44)
    expect(FAMILY).toHaveLength(3 * (3 * 44 + 24) + 18 + 36 + 18 + 44 + 24)
  })

  it.each(FAMILY)("$what, $how: $split", ({ what, split, script }) => {
    const coverage: Coverage =
      what === "its-confirmation" || what === "another's-confirmation"
        ? "unknown"
        : what
    const { log, last } = play(fileWith(coverage), script)
    const expected = oracle(script)
    const round = summariesOf(log)
      .flatMap((summary) => summary.rounds)
      .find((one) => one.screen === "r1")
    expect(round?.returned.map((one) => one.assisted)).toEqual(expected)

    // Since the last struggle: solved by an unassisted return only, but
    // off the ledger's parked list after any correct return (#2343).
    const returns = [...split.slice(split.lastIndexOf("S"))].filter(
      (one) => one === "R"
    ).length
    const sinceStruggle = expected.slice(expected.length - returns)
    expect(round?.solved).toBe(sinceStruggle.some((assisted) => !assisted))
    const parked = ledgerOf(log, last).parked.map((one) => one.screen)
    expect(parked.includes("r1")).toBe(returns === 0)
    // A rubric records no round it does not cover.
    expect(
      log.some(
        (event) => event.type === "rubric-shown" && event.screen === "r2"
      )
    ).toBe(what === "names-another")
  })
})
