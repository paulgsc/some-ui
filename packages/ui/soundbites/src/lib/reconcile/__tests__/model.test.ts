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

  it("leaves a take where it was when home didn't take the act, and says so", () => {
    const { state } = run([
      ...listed,
      { type: "act", id: "a", act: "again" },
      { type: "actAnswered", seq: 1, answer: "notTaken" },
    ])
    expect(ids(state)).toEqual(["a", "b"])
    expect(state.said).toEqual({ kind: "notTaken", id: "a" })
    expect(state.acting).toBeNull()
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

  it("plays one take at a time, and never plays audio for a play overtaken", () => {
    const { state, effects } = run([
      ...listed,
      { type: "play", id: "a" },
      { type: "play", id: "b" },
      { type: "audioRead", play: 1, audio: new Blob(["x"]) },
    ])
    expect(effects).toEqual([
      "readTakes",
      "readAudio",
      "stopPlayback",
      "readAudio",
    ])
    expect(state.playback).toEqual({ kind: "loading", id: "b" })
    const none = run(
      [{ type: "audioRead", play: state.plays, audio: null }],
      state
    )
    expect(none.state.unplayable).toBe("b")
  })
})
