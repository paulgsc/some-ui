/** @vitest-environment node */
import type {
  AttentionPage,
  AttentionTake,
  ReconcileEvent,
  ReconcileState,
} from "@soundbites/lib/reconcile/model"
import {
  INITIAL_RECONCILE,
  stepReconcile,
} from "@soundbites/lib/reconcile/model"
import { describe, expect, it } from "vitest"

const take = (id: string): AttentionTake => ({
  id,
  of: "rust-round",
  ref: "w46:QM-311",
  recordedAt: "2026-11-10T09:00:00.000Z",
  heard: "the borrow checker sad",
  verdict: {
    kind: "garbled",
    reasons: ["low_confidence"],
    rule: "heard-1",
    language: { heard: "en", expected: "en" },
  },
  hearAgain: null,
})

const PAGE: AttentionPage = { takes: [take("a"), take("b")], total: 2 }

/** Runs `events` from the start, returning the state and every effect. */
function run(
  events: ReadonlyArray<ReconcileEvent>,
  from: ReconcileState = INITIAL_RECONCILE
): { state: ReconcileState; effects: Array<string> } {
  let state = from
  const effects: Array<string> = []
  for (const event of events) {
    const next = stepReconcile(state, event)
    state = next.state
    effects.push(...next.effects.map((effect) => effect.type))
  }
  return { state, effects }
}

const listed: ReadonlyArray<ReconcileEvent> = [
  { type: "entered" },
  { type: "takesRead", seq: 1, read: { kind: "read", page: PAGE } },
]

const ids = (state: ReconcileState): Array<string> =>
  state.read.kind === "read" ? state.read.page.takes.map(({ id }) => id) : []

const FREE = { askAgainAt: null, hearing: false } as const
const LATER = "2026-11-21T15:00:00.000Z"

/** The page with take `a` as home says it hears it again. */
const pageWith = (hearAgain: AttentionTake["hearAgain"]): AttentionPage => ({
  takes: [{ ...take("a"), hearAgain }, take("b")],
  total: 2,
})

const listedWith = (
  hearAgain: AttentionTake["hearAgain"]
): ReadonlyArray<ReconcileEvent> => [
  { type: "entered" },
  {
    type: "takesRead",
    seq: 1,
    read: { kind: "read", page: pageWith(hearAgain) },
  },
]

describe("asking home to hear a take again, from the takes needing attention (#3339)", () => {
  it("asks only of a take home will hear again, and keeps it listed once home will", () => {
    const quiet = run([...listed, { type: "hearAgain", id: "b" }])
    expect(quiet.effects).not.toContain("sendHearAgain")
    const { state, effects } = run([
      ...listedWith(FREE),
      { type: "hearAgain", id: "a" },
      {
        type: "hearAgainAnswered",
        seq: 1,
        answer: { kind: "asked", askAgainAt: LATER },
      },
    ])
    expect(effects).toContain("sendHearAgain")
    expect(ids(state)).toEqual(["a", "b"])
    expect(state.hearAgain.changed.get("a")).toEqual({
      askAgainAt: LATER,
      hearing: true,
    })
  })

  it("drops a take home holds nothing more to hear in, and a fresh read takes home's word over what was laid on it", () => {
    const settled = run([
      ...listedWith(FREE),
      { type: "hearAgain", id: "a" },
      { type: "hearAgainAnswered", seq: 1, answer: { kind: "settled" } },
    ])
    expect(ids(settled.state)).toEqual(["b"])
    const asked = run([
      ...listedWith(FREE),
      { type: "hearAgain", id: "a" },
      {
        type: "hearAgainAnswered",
        seq: 1,
        answer: { kind: "asked", askAgainAt: LATER },
      },
      { type: "readAgain" },
      { type: "takesRead", seq: 2, read: { kind: "read", page: PAGE } },
    ])
    expect(asked.state.hearAgain.changed.size).toBe(0)
  })
})

describe("the takes needing attention's machine (HEARD3)", () => {
  it("reads on entering, and an answer to an earlier read changes nothing", () => {
    const { state } = run([
      { type: "entered" },
      { type: "readAgain" },
      { type: "takesRead", seq: 1, read: { kind: "away" } },
    ])
    expect(state.read.kind).toBe("reading")
    const after = run(
      [{ type: "takesRead", seq: 2, read: { kind: "read", page: PAGE } }],
      state
    )
    expect(ids(after.state)).toEqual(["a", "b"])
  })

  it("tells home of one act at a time, and drops the take once home kept it", () => {
    const { state, effects } = run([
      ...listed,
      { type: "act", id: "a", act: "keep" },
      { type: "act", id: "b", act: "again" },
    ])
    expect(effects).toEqual(["readTakes", "sendAct"])
    expect(state.acting).toEqual({ id: "a", act: "keep" })
    const kept = run([{ type: "actAnswered", seq: 1, answer: "kept" }], state)
    expect(ids(kept.state)).toEqual(["b"])
    expect(kept.state.said).toEqual({ kind: "kept", act: "keep" })
    expect(kept.state.read.kind === "read" && kept.state.read.page.total).toBe(
      1
    )
  })

  it.each(["notTaken", "busy"] as const)(
    "leaves a take where it was when the act ended %s, and says so",
    (answer) => {
      const { state } = run([
        ...listed,
        { type: "act", id: "a", act: "again" },
        { type: "actAnswered", seq: 1, answer },
      ])
      expect(ids(state)).toEqual(["a", "b"])
      expect(state.said).toEqual({ kind: answer, id: "a" })
      expect(state.acting).toBeNull()
    }
  )

  it("drops a take home has nothing left to reconcile on, and says so", () => {
    const { state } = run([
      ...listed,
      { type: "act", id: "a", act: "keep" },
      { type: "actAnswered", seq: 1, answer: "settled" },
    ])
    expect(ids(state)).toEqual(["b"])
    expect(state.said).toEqual({ kind: "settled" })
  })

  it("closes each notice on its own", () => {
    const { state } = run([
      ...listed,
      { type: "act", id: "a", act: "again" },
      { type: "actAnswered", seq: 1, answer: "notTaken" },
      { type: "play", id: "b" },
      { type: "audioRead", play: 1, audio: null },
      { type: "unplayableDismissed" },
    ])
    expect(state.unplayable).toBeNull()
    expect(state.said).toEqual({ kind: "notTaken", id: "a" })
  })

  it("never acts on a take the list doesn't hold", () => {
    const { effects } = run([...listed, { type: "act", id: "z", act: "keep" }])
    expect(effects).toEqual(["readTakes"])
  })

  it("ignores an answer to an act no longer asked", () => {
    const { state } = run([
      ...listed,
      { type: "act", id: "a", act: "keep" },
      { type: "actAnswered", seq: 9, answer: "kept" },
    ])
    expect(ids(state)).toEqual(["a", "b"])
    expect(state.acting).not.toBeNull()
  })

  it("stops what plays when its take leaves, by an act or a delete", () => {
    const playing = run([
      ...listed,
      { type: "play", id: "a" },
      { type: "audioRead", play: 1, audio: new Blob(["x"]) },
    ]).state
    expect(playing.playback).toEqual({ kind: "playing", id: "a" })
    const deleted = run([{ type: "deleted", ids: ["a"] }], playing)
    expect(deleted.effects).toEqual(["stopPlayback"])
    expect(ids(deleted.state)).toEqual(["b"])
    const kept = run(
      [
        { type: "act", id: "a", act: "keep" },
        { type: "actAnswered", seq: 1, answer: "kept" },
      ],
      playing
    )
    expect(kept.effects).toEqual(["sendAct", "stopPlayback"])
    // Another take leaving leaves the playing one playing.
    const other = run([{ type: "deleted", ids: ["b"] }], playing)
    expect(other.effects).toEqual([])
    expect(other.state.playback.kind).toBe("playing")
  })
})
