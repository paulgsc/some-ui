/**
 * LTY1 (#2029, #2343, canon Rem. 9.5, Rem. 11.10): a correct, unhurried
 * return of a parked round counts as solving it only when nothing that
 * showed its answer (a take's rubric covering it, its worked confirmation,
 * or a correct replay's reveal) was shown since its last struggle, though
 * any correct, unhurried return unparks it on the ledger.
 *
 * The Family, played end to end on the runtime into the log and read back
 * by `ledgerOf` and `summariesOf`:
 *
 * - order: every order of a struggle that parks the round (S), its answer
 *   shown (T) and a return (R) in which the return follows a struggle
 *   (`STR`, `SRT`, `TSR`), and three that test how long assistance lasts:
 *   a second struggle after T (`STSR`), a second return (`STRR`), and a
 *   fresh struggle after a return (`STRSR`);
 * - the first return's answer: correct, correct but slow, incorrect, or
 *   abstained (Def. 9.4: all but the first are struggles, which restart the
 *   window);
 * - what showed the answer: a take's rubric whose coverage is known and
 *   names the round, known and names another round, or unknown (text
 *   alone, read as every round of the file still parked when it is shown);
 *   the round's own worked confirmation; another round's; a correct,
 *   unhurried replay of the round, whose reveal shows the confirmation;
 * - how: a rubric after a typed answer, after a pass, or as a parked take's
 *   confirmation; a confirmation on the reveal of a struggle or a struggled
 *   return; either confirmation at a round boundary or from the first
 *   screen (Prop. 9.4 (d)); the replay played from the hub;
 * - session: every split of the order into sessions;
 * - file: the round and the take in one file, enumerated; and below, a
 *   round parked in an earlier session that the default coverage reaches,
 *   and two files sharing screen ids, which never assist each other.
 *
 * Only what the phone can offer is played: a confirmation from the parked
 * list needs its round or take parked, the first screen comes before any
 * step of its session, and a reveal's confirmation follows a struggle that
 * did not show it. The oracle is the claim.
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
type What =
  | Coverage
  | "its-confirmation"
  | "another's-confirmation"
  | "correct-replay"
type How =
  | "typed"
  | "passed"
  | "at-the-reveal"
  | "at-a-boundary"
  | "from-the-first-screen"
  | "played-again"
type Answer = "correct" | "slow" | "incorrect" | "abstained"

/** The hub's actions, by index. */
const HUB = {
  round: 0,
  take: 1,
  return: 2,
  done: 3,
  other: 4,
  otherReturn: 5,
} as const

/** Each answer's option on a round or a return. */
const OPTION: Record<Answer, number> = {
  correct: 0,
  slow: 0,
  incorrect: 1,
  abstained: 2,
}

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
 * A hub every step starts and ends at: the rounds r1 and r2, their returns
 * r1b and r2b, and a take t1 whose rubric has the coverage asked.
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
          { label: "Its return", next: "r2b" },
        ],
      },
      r1: choice("hub"),
      r1b: { ...choice("hub"), returnOf: "r1" },
      r2: choice("hub"),
      r2b: { ...choice("hub"), returnOf: "r2" },
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
  | { readonly kind: "R"; readonly answer: Answer }
  | { readonly kind: "|" }
  /** The next sessions play this file. */
  | { readonly kind: "file"; readonly name: string }
  /** A struggle on r2, its correct return, and five quick correct picks. */
  | { readonly kind: "S2" }
  | { readonly kind: "R2" }
  | { readonly kind: "picks" }
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
    case "unknown":
    case "correct-replay": {
      return "t1"
    }
    default: {
      return assertNever(what)
    }
  }
}

/** A struggle that does not show the answer on its reveal. */
const struggled = (token: Token | undefined): boolean =>
  token?.kind === "S" || (token?.kind === "R" && token.answer !== "correct")

/**
 * Plays `script` over `files`, a new session at each `|`, and returns the
 * log and the last session's id. Each step is a second on the clock, so
 * every pick takes a second; a slow one takes far longer, against the
 * median the `picks` token gives.
 */
function play(
  files: Readonly<Record<string, SessionFile>>,
  script: ReadonlyArray<Token>
): { log: SessionLog; last: string } {
  const log = createSessionLogStore(memoryStorage())
  let now = Date.parse("2026-10-31T09:00:00.000Z")
  let id = 0
  const ports = {
    log,
    now: (): number => now,
    newId: (): string => `id${String(++id)}`,
  }
  let name = Object.keys(files)[0] ?? ""
  const file = (): SessionFile => {
    const found = files[name]
    if (found === undefined) throw new Error(`no file ${name}`)
    return found
  }
  let runtime = new IncidentPlayRuntime(ports)
  const tick = (): void => {
    now += 1000
  }
  const at = (): string | undefined => runtime.getSnapshot().play?.screen
  // Starts the session in hand unless it has started.
  const start = (): void => {
    tick()
    runtime.start({ fileName: name, file: file(), form: "full" })
  }
  const act = (action: number): void => {
    tick()
    runtime.dispatch({ type: "act", action })
  }
  const pick = (option: number, confirm: boolean): void => {
    tick()
    runtime.dispatch({ type: "pick", option })
    if (confirm) runtime.dispatch({ type: "show-confirmation" })
    tick()
    runtime.dispatch({ type: "continue" })
  }
  const confirmation = (what: What): void => {
    tick()
    runtime.takeConfirmation(name, file(), confirmed(what))
  }
  script.forEach((token, index) => {
    const next = script[index + 1]
    const confirmNext = next?.kind === "T" && next.how === "at-the-reveal"
    if (token.kind === "file") {
      name = token.name
      return
    }
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
      confirmation(token.what)
      return
    }
    start()
    // Taken on the reveal of the struggle just played.
    if (token.kind === "T" && token.how === "at-the-reveal") return
    expect(at()).toBe("hub")
    switch (token.kind) {
      case "S": {
        act(HUB.round)
        pick(OPTION.incorrect, confirmNext)
        break
      }
      case "S2": {
        act(HUB.other)
        pick(OPTION.incorrect, false)
        break
      }
      case "R2": {
        act(HUB.otherReturn)
        pick(OPTION.correct, false)
        break
      }
      case "picks": {
        for (let n = 0; n < 5; n += 1) {
          act(HUB.other)
          pick(OPTION.correct, false)
        }
        break
      }
      case "R": {
        act(HUB.return)
        if (token.answer === "slow") now += 3_600_000
        pick(OPTION[token.answer], confirmNext)
        break
      }
      case "T": {
        switch (token.how) {
          case "at-a-boundary": {
            confirmation(token.what)
            break
          }
          case "played-again": {
            act(HUB.round)
            pick(OPTION.correct, false)
            break
          }
          case "typed":
          case "passed": {
            act(HUB.take)
            runtime.dispatch(
              token.how === "passed"
                ? { type: "pass" }
                : {
                    type: "answered",
                    answer: { as: "typed", text: "A typed one." },
                  }
            )
            tick()
            runtime.dispatch({ type: "ticked", ticks: [] })
            break
          }
          case "at-the-reveal":
          case "from-the-first-screen": {
            throw new Error(`${token.how} is played before the hub`)
          }
          default: {
            assertNever(token.how)
          }
        }
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

type Expected = {
  /** Each return of r1, assisted or not. */
  readonly assisted: Array<boolean>
  readonly solved: boolean
  readonly parked: boolean
}

/** What the claim says of r1, step by step. */
function oracle(script: ReadonlyArray<Token>): Expected {
  const assisted: Array<boolean> = []
  let shown = false
  let parked = false
  let solved = false
  for (const token of script) {
    if (token.kind === "S") {
      // What was shown before this struggle did not keep it from struggling.
      shown = false
      parked = true
      solved = false
    }
    if (token.kind === "T") {
      shown ||=
        token.what === "names-it" ||
        token.what === "its-confirmation" ||
        token.what === "correct-replay" ||
        (token.what === "unknown" && parked)
    }
    if (token.kind === "R") {
      assisted.push(shown)
      if (token.answer === "correct") {
        solved ||= !shown
        parked = false
        // Its reveal shows the worked confirmation.
        shown = true
      } else {
        // A struggle: the window starts again.
        shown = false
      }
    }
  }
  return { assisted, solved, parked }
}

const ORDERS = ["STR", "SRT", "TSR", "STSR", "STRR", "STRSR"] as const
const ANSWERS: ReadonlyArray<Answer> = [
  "correct",
  "slow",
  "incorrect",
  "abstained",
]

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
  { what: "correct-replay", how: "played-again" },
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

/** `split` as tokens: its first return answers `answer`, any later one right. */
function tokensOf(
  split: string,
  what: What,
  how: How,
  answer: Answer
): Array<Token> {
  let returns = 0
  return [...split].map((one): Token => {
    switch (one) {
      case "T": {
        return { kind: "T", what, how }
      }
      case "S": {
        return { kind: "S" }
      }
      case "R": {
        returns += 1
        return { kind: "R", answer: returns === 1 ? answer : "correct" }
      }
      case "|": {
        return { kind: "|" }
      }
      default: {
        throw new Error(`"${one}" is no step`)
      }
    }
  })
}

/** Whether the phone offers each `T` in `tokens` where it stands. */
function playable(tokens: ReadonlyArray<Token>): boolean {
  let parked = false
  return tokens.every((token, index) => {
    const before = tokens[index - 1]
    if (token.kind === "S") parked = true
    if (token.kind === "R" && token.answer === "correct") parked = false
    if (token.kind !== "T") return true
    if (
      token.how === "from-the-first-screen" &&
      !(index === 0 || before?.kind === "|")
    ) {
      return false
    }
    if (token.how === "at-the-reveal") return struggled(before)
    // The parked list offers r1's confirmation only while r1 is parked.
    return token.what !== "its-confirmation" || parked
  })
}

function scriptOf(
  split: string,
  what: What,
  how: How,
  answer: Answer
): Array<Token> | null {
  const tokens = tokensOf(split, what, how, answer)
  if (!playable(tokens)) return null
  const prelude: Array<Token> = []
  // A slow pick needs a median of earlier ones (Def. 9.4).
  if (answer === "slow") prelude.push({ kind: "picks" })
  // A confirmation from the parked list needs its take or round parked.
  const fromList = how === "at-a-boundary" || how === "from-the-first-screen"
  if (fromList && what === "another's-confirmation") {
    prelude.push({ kind: "S2" })
  } else if (fromList && what !== "its-confirmation") {
    prelude.push({ kind: "T", what, how: "passed" })
  }
  return prelude.length === 0 ? tokens : [...prelude, { kind: "|" }, ...tokens]
}

const FAMILY = WAYS.flatMap(({ what, how }) =>
  ANSWERS.flatMap((answer) =>
    ORDERS.flatMap((order) =>
      splits(order).flatMap((split) => {
        const script = scriptOf(split, what, how, answer)
        return script === null ? [] : [{ what, how, answer, split, script }]
      })
    )
  )
)

const coverageOf = (what: What): Coverage =>
  what === "names-it" || what === "names-another" || what === "unknown"
    ? what
    : "unknown"

/** What `summariesOf` and `ledgerOf` say of `round` in `file`. */
function readBack(
  log: SessionLog,
  last: string,
  file: string,
  round: string
): Expected {
  const summary = summariesOf(log)
    .flatMap((one) => one.rounds)
    .find((one) => one.file === file && one.screen === round)
  return {
    assisted: summary?.returned.map((one) => one.assisted) ?? [],
    solved: summary?.solved ?? false,
    parked: ledgerOf(log, last).parked.some(
      (one) => one.file === file && one.screen === round
    ),
  }
}

describe("LTY1: a return after anything that showed its answer is assisted", () => {
  it("enumerates every member of the Family the phone can play", () => {
    const count = (what: What, how: How, answer: Answer): number =>
      FAMILY.filter(
        (one) => one.what === what && one.how === how && one.answer === answer
      ).length
    // Splits: 4 each of STR, SRT and TSR, 8 each of STSR and STRR, 16 of
    // STRSR: 44. The first screen keeps those where a session opens with T.
    expect(count("names-it", "typed", "correct")).toBe(44)
    expect(count("names-it", "from-the-first-screen", "correct")).toBe(24)
    // A reveal's confirmation needs T right after a struggle in its session:
    // after S, or after a struggled return (SRT).
    expect(count("its-confirmation", "at-the-reveal", "correct")).toBe(18)
    expect(count("its-confirmation", "at-the-reveal", "incorrect")).toBe(20)
    // Per first return's answer: rubrics 3 × (3 × 44 + 24), another's
    // confirmation 44 + 24, the replay 44, and r1's own confirmation
    // 18 + 36 + 18 after a correct return, 20 + 40 + 20 after a struggled
    // one, which leaves r1 parked: 4 × 580 + 72 + 3 × 80.
    expect(FAMILY).toHaveLength(2632)
  })

  it.each(FAMILY)(
    "$what, $how, first return $answer: $split",
    ({ what, script }) => {
      const { log, last } = play(
        { "lty1.json": fileWith(coverageOf(what)) },
        script
      )
      expect(readBack(log, last, "lty1.json", "r1")).toEqual(oracle(script))
      // A rubric records no round it does not cover.
      expect(
        log.some(
          (event) => event.type === "rubric-shown" && event.screen === "r2"
        )
      ).toBe(what === "names-another")
    }
  )

  it("covers a round of the file parked in an earlier session, where the rubric says no `covers`", () => {
    const { log, last } = play({ "lty1.json": fileWith("unknown") }, [
      { kind: "S2" },
      { kind: "|" },
      { kind: "T", what: "correct-replay", how: "played-again" },
      { kind: "T", what: "unknown", how: "typed" },
      { kind: "R2" },
    ])
    expect(log).toContainEqual(
      expect.objectContaining({ type: "rubric-shown", screen: "r2" })
    )
    expect(readBack(log, last, "lty1.json", "r2")).toEqual({
      assisted: [true],
      solved: false,
      parked: false,
    })
  })

  it.each(["names-it", "unknown"] as const)(
    "never lets one file's rubric (%s) assist another file's round of the same id",
    (coverage) => {
      const files = {
        "a.json": fileWith(coverage),
        "b.json": fileWith(coverage),
      }
      const { log, last } = play(files, [
        { kind: "S" },
        { kind: "|" },
        { kind: "file", name: "b.json" },
        { kind: "T", what: coverage, how: "typed" },
        { kind: "|" },
        { kind: "file", name: "a.json" },
        { kind: "R", answer: "correct" },
      ])
      expect(readBack(log, last, "a.json", "r1")).toEqual({
        assisted: [false],
        solved: true,
        parked: false,
      })
      // b.json's text-only rubric covers b.json's parked rounds: none.
      expect(
        log.some(
          (event) => event.type === "rubric-shown" && event.file === "b.json"
        )
      ).toBe(coverage === "names-it")
    }
  )
})
