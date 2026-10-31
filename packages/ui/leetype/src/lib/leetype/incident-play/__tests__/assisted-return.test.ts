/**
 * LTY1 (#2029, canon Rem. 9.5, Rem. 11.10): a return counts as solving its
 * round only when no take's rubric stating the round's answer was shown
 * between the round's last struggle and the return.
 *
 * The Family, played end to end on the runtime into the log and read back
 * by `ledgerOf` and `summariesOf`:
 *
 * - every order of a struggle that parks the round (S), a take's rubric
 *   shown (T) and a return of the round (R) in which the return follows a
 *   struggle (`S T R`, `S R T`, `T S R`), and the two that test how long
 *   assistance lasts: a second struggle after the rubric (`S T S R`) and a
 *   second return (`S T R R`);
 * - the rubric's coverage: known and naming the round, known and naming
 *   another round, or unknown (no point says `covers`), which is read as
 *   every round parked in the session that shows it;
 * - the session each event falls in: every split of the order into
 *   sessions;
 * - how the rubric is shown: after a typed answer, after a pass, or as a
 *   parked take's worked confirmation at a round boundary or from the
 *   first screen (Prop. 9.4 (d)).
 *
 * The oracle is the claim: a return is assisted when, after the round's
 * last struggle before it, some rubric shown covers the round.
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
type Show = "typed" | "passed" | "at-a-boundary" | "from-the-first-screen"

const FILE_NAME = "lty1.json"

/** The hub's actions, by index. */
const HUB = { round: 0, take: 1, return: 2, done: 3 } as const

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
    oneLine: "Struggle, take and return in every order.",
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
  | { readonly kind: "T"; readonly show: Show }

/**
 * Plays `script` on `file`, a new session at each `|`, and returns the log
 * and the last session's id. A take shown as a confirmation needs the take
 * parked first, so those scripts open with a session that passes it.
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
  for (const token of script) {
    if (token.kind === "|") {
      start()
      act(HUB.done)
      expect(runtime.getSnapshot().play?.ended).toBe("declared")
      runtime = new IncidentPlayRuntime(ports)
      continue
    }
    if (token.kind === "T" && token.show === "from-the-first-screen") {
      if (at() !== undefined) {
        throw new Error("the first screen is before any step")
      }
      runtime.takeConfirmation(FILE_NAME, file, "t1")
      continue
    }
    start()
    expect(at()).toBe("hub")
    switch (token.kind) {
      case "S": {
        act(HUB.round)
        runtime.dispatch({ type: "pick", option: 1 })
        runtime.dispatch({ type: "continue" })
        break
      }
      case "R": {
        act(HUB.return)
        runtime.dispatch({ type: "pick", option: 0 })
        runtime.dispatch({ type: "continue" })
        break
      }
      case "T": {
        if (token.show === "at-a-boundary") {
          runtime.takeConfirmation(FILE_NAME, file, "t1")
          break
        }
        act(HUB.take)
        runtime.dispatch(
          token.show === "passed"
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
  }
  start()
  const kept = log.getSnapshot()
  expect(kept.problem).toBeNull()
  const last = kept.log.at(-1)?.session ?? ""
  return { log: kept.log, last }
}

/** Whether each return in `script` is assisted, by the claim. */
function oracle(
  coverage: Coverage,
  script: ReadonlyArray<Token>
): Array<boolean> {
  const expected: Array<boolean> = []
  let assisted = false
  let parkedThisSession = false
  for (const token of script) {
    if (token.kind === "|") parkedThisSession = false
    if (token.kind === "S") {
      assisted = false
      parkedThisSession = true
    }
    if (token.kind === "T") {
      // A rubric shown before any struggle assists nothing: the park clears it.
      assisted ||=
        coverage === "names-it" || (coverage === "unknown" && parkedThisSession)
    }
    if (token.kind === "R") expected.push(assisted)
  }
  return expected
}

const ORDERS = ["STR", "SRT", "TSR", "STSR", "STRR"] as const
const SHOWS: ReadonlyArray<Show> = [
  "typed",
  "passed",
  "at-a-boundary",
  "from-the-first-screen",
]
const COVERAGES: ReadonlyArray<Coverage> = [
  "names-it",
  "names-another",
  "unknown",
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

function tokenOf(one: string, show: Show): Token {
  switch (one) {
    case "T": {
      return { kind: "T", show }
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

function scriptOf(split: string, show: Show): Array<Token> | null {
  const tokens = [...split].map((one) => tokenOf(one, show))
  if (show === "from-the-first-screen") {
    // Before any step of its session: only where a session opens with it.
    const opens = tokens.every(
      (token, index) =>
        token.kind !== "T" || index === 0 || tokens[index - 1]?.kind === "|"
    )
    if (!opens) return null
  }
  // A take's confirmation is offered once the take is parked: pass it first.
  const parksTake = show === "at-a-boundary" || show === "from-the-first-screen"
  return parksTake
    ? [{ kind: "T", show: "passed" }, { kind: "|" }, ...tokens]
    : tokens
}

const FAMILY = COVERAGES.flatMap((coverage) =>
  SHOWS.flatMap((show) =>
    ORDERS.flatMap((order) =>
      splits(order).flatMap((split) => {
        const script = scriptOf(split, show)
        return script === null ? [] : [{ coverage, show, split, script }]
      })
    )
  )
)

describe("LTY1: a return after a rubric that states its answer is assisted", () => {
  it("enumerates every member of the Family that can be played", () => {
    // Splits: 4 each of STR, SRT and TSR, 8 each of STSR and STRR. From
    // the first screen only those where a session opens with the take: 16.
    expect(FAMILY).toHaveLength(3 * (3 * 28 + 16))
  })

  it.each(FAMILY)("$coverage, $show: $split", ({ coverage, split, script }) => {
    const file = fileWith(coverage)
    const { log, last } = play(file, script)
    const expected = oracle(coverage, script)
    const round = summariesOf(log)
      .flatMap((summary) => summary.rounds)
      .find((one) => one.screen === "r1")
    expect(round?.returned.map((one) => one.assisted)).toEqual(expected)

    // Solved once an unassisted return follows its last struggle.
    const lastPark = split.lastIndexOf("S")
    const after = [...split.slice(lastPark)].filter((one) => one === "R")
    const solved = expected.slice(expected.length - after.length)
    const unassisted = solved.some((assisted) => !assisted)
    expect(round?.solved).toBe(unassisted)
    const parked = ledgerOf(log, last).parked.map((one) => one.screen)
    expect(parked.includes("r1")).toBe(!unassisted)
    // Never a round the rubric does not cover.
    expect(
      log.some(
        (event) => event.type === "rubric-shown" && event.screen === "r2"
      )
    ).toBe(coverage === "names-another")
  })
})
