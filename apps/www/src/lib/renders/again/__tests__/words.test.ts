/**
 * @vitest-environment node
 *
 * What Run it again says (RETRY): in the person's terms, never machinery,
 * for every stop, plan and answer.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Attention, Plan, Step, Stop } from "@/lib/renders/again/model"
import { planOf } from "@/lib/renders/again/model"
import {
  AGAIN_CONVEYOR_WORDS,
  AGAIN_WORDS,
  answerLine,
  runLine,
  stepLine,
  stepLog,
  stepStation,
  takesStep,
  toTakes,
  youLine,
} from "@/lib/renders/again/words"
import type { RenderFailed } from "@/lib/renders/model"
import { failedLine } from "@/lib/renders/words"

const STOPS: ReadonlyArray<Stop> = [
  { kind: "burnt", by: "recorder" },
  { kind: "burnt", by: "home" },
  { kind: "takes-unheard", takes: ["a", "b"] },
  { kind: "takes-unheard", takes: ["a"] },
  { kind: "takes-unheard", takes: [] },
  {
    kind: "policy",
    refusal: { kind: "too-long", minutes: 64, capMinutes: 60 },
  },
  { kind: "missing", what: "take" },
  { kind: "missing", what: "clip" },
  { kind: "snips", gone: true },
  { kind: "snips", gone: false },
  { kind: "preview" },
]

/** A failed row of every kind home's board sends. */
const ROW: RenderFailed = {
  feed: "cards-essay",
  key: "rust-rounds-how-it-works-2026-11-20",
  at: 1,
  by: "recorder",
  exit: 1,
}

const ROWS: ReadonlyArray<RenderFailed> = [
  ROW,
  { ...ROW, by: "home", exit: null },
  { ...ROW, feed: "clip-walk", key: "ledger-wake-before" },
  { ...ROW, reason: "take-unheard", items: ["a", "b"] },
  { ...ROW, reason: "take-missing", items: ["a"] },
  { ...ROW, reason: "clip-missing" },
  { ...ROW, reason: "snip-missing" },
  { ...ROW, reason: "snip-gone" },
  {
    ...ROW,
    feed: "rust-essay",
    key: "2026-W46",
    reason: "too-long",
    minutes: 64,
    capMinutes: 60,
  },
  { ...ROW, reason: "too-large", mb: 700, capMb: 500 },
  { ...ROW, reason: "overflow", scenes: ["c3-intro"], sceneCount: 1 },
  {
    ...ROW,
    reason: "overflow",
    scenes: ["c3-intro", "c4-rows"],
    sceneCount: 5,
    sceneNames: ["How a round opens", "The cheat sheet"],
  },
  { ...ROW, feed: "preview", key: "rust-essay-20261111T010000Z" },
]

const ATTENTIONS: ReadonlyArray<Attention> = [
  { kind: "unread" },
  { kind: "read", waiting: new Set() },
  { kind: "read", waiting: new Set(["a"]) },
  { kind: "read", waiting: new Set(["a", "b", "c"]) },
]

const STEP: Step = {
  state: "asked",
  askedAt: 1_795_390_000,
  startedAt: null,
  endedAt: null,
  reason: null,
  items: [],
}

const STEPS: ReadonlyArray<Step> = [
  ...(
    ["missing", "asked", "waiting", "rendering", "done", "failed"] as const
  ).map((state) => ({ ...STEP, state })),
  { ...STEP, state: "rendering", startedAt: 1_795_390_100 },
  { ...STEP, state: "done", startedAt: 1_795_390_100, endedAt: 1_795_391_000 },
  {
    ...STEP,
    state: "failed",
    startedAt: 1_795_390_100,
    endedAt: 1_795_391_000,
  },
  ...[
    "take-unheard",
    "take-missing",
    "too-long",
    "too-large",
    "overflow",
    "snip-gone",
    "snip-missing",
    "clip-missing",
    "settling",
    "something-new",
  ].map(
    (reason): Step => ({
      ...STEP,
      state: "blocked",
      reason,
      items: ["a", "b"],
      endedAt: 1_795_391_000,
    })
  ),
  { ...STEP, state: "blocked", reason: "take-unheard" },
]

/** Every line `words` holds, each function said for 0 to 3 takes. */
function flat(value: unknown): ReadonlyArray<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function")
    return [0, 1, 2, 3].map((n) =>
      String(Reflect.apply(value, undefined, [n, "an essay"]))
    )
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(flat)
  return []
}

describe("Run it again's words", () => {
  const plans: ReadonlyArray<Plan> = STOPS.flatMap((stop) =>
    ["cards-essay", "clip-walk"].flatMap((feed) =>
      ATTENTIONS.map((attention) => planOf(stop, attention, feed))
    )
  )
  const said = [
    ...ROWS.map(youLine),
    ...plans.map(runLine),
    ...plans.flatMap((plan) =>
      plan.kind === "takes"
        ? Object.values(takesStep(plan)).filter((v) => typeof v === "string")
        : []
    ),
    answerLine({ kind: "notHere" }),
    answerLine({ kind: "unreadable" }),
    ...STEPS.map(stepLine),
    ...STEPS.flatMap((step) => stepLog(step, 1_795_391_500, "UTC")),
    ...flat(AGAIN_CONVEYOR_WORDS),
    ...[1, 2, 3].map(toTakes),
    ...flat(AGAIN_WORDS),
  ]

  it("says no machinery", () => {
    for (const line of said) expect(line, line).not.toMatch(MACHINERY)
  })

  it("says every failure at a glance: what, where by name, what home does, what you can do (the owner, 2026-11-23)", () => {
    for (const row of ROWS) {
      const line = failedLine(row)
      const you = youLine(row)
      // What home does about it: tries again, or holds it.
      if (row.feed !== "preview")
        expect(line, JSON.stringify(row)).toMatch(
          /[Hh]ome (tries|doesn't try|makes it then)|It tries again|it holds|isn't made until/
        )
      // What the owner can do, or that nothing on the phone changes it.
      expect(you, JSON.stringify(row)).toMatch(
        /Run it again|Ask home|Ask for another|Nothing on this phone/
      )
      // Never a recorder's id.
      for (const id of row.scenes ?? []) expect(line).not.toContain(id)
    }
    const named = ROWS.at(-2)
    expect(named && failedLine(named)).toBe(
      "The scenes “How a round opens”, “The cheat sheet” and 3 more are too full for their frame, so the video would cut them off. Home doesn't try it again as it is."
    )
    const unnamed = ROWS.at(-3)
    expect(unnamed && failedLine(unnamed)).toBe(
      "One scene is too full for its frame, so the video would cut it off. Home doesn't try it again as it is."
    )
  })

  it("says each stop's way forward in plain words", () => {
    expect(
      runLine(
        planOf(
          { kind: "takes-unheard", takes: ["a", "b"] },
          { kind: "read", waiting: new Set(["a", "b"]) },
          "cards-essay"
        )
      )
    ).toBe("Once home is asked to hear both again.")
    expect(
      takesStep({ kind: "takes", takes: ["a", "b"], waiting: [], read: true })
        .title
    ).toBe("Both recordings are answered")
  })

  it("says a step home is still settling is worth a second try", () => {
    expect(stepLine({ ...STEP, state: "blocked", reason: "settling" })).toBe(
      "Home is still getting this essay ready. Try again in a minute."
    )
  })

  it("lays every step on the conveyor, and says how long each took", () => {
    expect(stepStation({ ...STEP, state: "rendering" })).toEqual({
      at: "oven",
      aside: null,
    })
    expect(stepStation({ ...STEP, state: "failed" })).toEqual({
      at: "oven",
      aside: "burnt",
    })
    expect(stepStation({ ...STEP, state: "blocked" })).toEqual({
      at: "asked",
      aside: "setAside",
    })
    expect(
      stepLog(
        {
          ...STEP,
          state: "done",
          startedAt: 1_795_390_100,
          endedAt: 1_795_391_300,
        },
        1_795_391_500,
        "UTC"
      )
    ).toEqual([
      "Asked at 11:26 PM.",
      "In the oven from 11:28 PM, for about 20 minutes.",
      "Ready at 11:48 PM.",
    ])
    expect(
      stepLog({ ...STEP, state: "waiting" }, 1_795_390_600, "UTC")
    ).toEqual(["Asked at 11:26 PM.", "Waiting its turn for about 10 minutes."])
  })

  it("never says a step is done before the takes are read", () => {
    const step = takesStep({
      kind: "takes",
      takes: ["a"],
      waiting: ["a"],
      read: false,
    })
    expect(step.done).toBe(false)
  })
})
