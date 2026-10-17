import type { LensItem } from "@topik/lib/topik/read-aloud/lens/items"
import type {
  LensEffect,
  LensState,
  LensTap,
} from "@topik/lib/topik/read-aloud/lens/machine"
import {
  createLensMachine,
  currentOutcome,
  lensReducer,
  lensSummary,
} from "@topik/lib/topik/read-aloud/lens/machine"
import { MAX_SCREEN_MS, SITTING_MS } from "@topik/lib/topik/read-aloud/timing"
import { describe, expect, it } from "vitest"

/** 학교에 가요: a pick between 에 (right) and 에서, with a cue to be heard. */
const PICK: LensItem = {
  key: "l:school",
  lineId: "school",
  level: 1,
  cue: { korean: "어떻게 가요?", segments: [], decides: [], modality: "audio" },
  korean: "학교에 가요.",
  segments: [],
  words: ["학교에", "가요"],
  decides: [1],
  shape: {
    kind: "pick",
    word: 0,
    prefix: "학교",
    candidates: [
      { surface: "학교에서", label: "에서", mistake: "eseo-for-e" },
      { surface: "학교에", label: "에" },
    ],
  },
  probes: [
    { rung: 4, kind: "tense", word: "가요", answer: "present" },
    { rung: 1, kind: "verb", answer: 1 },
  ],
  situations: { options: ["a", "b", "c"], intended: 1 },
}

/** The same line as a judge shown as authored, with no cue. */
const AUTHORED: LensItem = {
  ...PICK,
  key: "l:school-judge",
  cue: null,
  shape: { kind: "judge", misform: null },
}

const RIGHT = { kind: "pick", candidate: 1 } as const
const WRONG = { kind: "pick", candidate: 0 } as const

class Host {
  state: LensState = createLensMachine()
  effects: Array<LensEffect> = []
  now = 0

  send(event: LensTap): void {
    const transition = lensReducer(this.state, {
      ...event,
      at: this.now,
    })
    this.state = transition.state
    this.effects = transition.effects
  }

  begin(items: Array<LensItem>): void {
    this.send({ type: "begin", items })
  }

  /** Let the current screen's two minutes run out. */
  expire(): void {
    this.now += MAX_SCREEN_MS
    this.send({ type: "elapsed", seq: this.state.seq })
  }
}

describe("the grammar-lens machine", () => {
  it("speaks a heard cue on entering an item, and gives each screen two minutes", () => {
    const host = new Host()
    host.begin([PICK])
    expect(host.state.phase.name).toBe("item")
    expect(host.effects).toEqual([
      { type: "stop-speech" },
      { type: "speak-cue", text: "어떻게 가요?" },
      { type: "wait", seq: host.state.seq, ms: MAX_SCREEN_MS },
    ])
  })

  it("reveals a right answer at once", () => {
    const host = new Host()
    host.begin([PICK, AUTHORED])
    host.send({ type: "answer", answer: RIGHT })
    expect(host.state.phase.name).toBe("reveal")
    expect(currentOutcome(host.state)).toMatchObject({
      right: true,
      chosen: null,
      probes: [],
    })
  })

  it("closes an item on leaving its reveal, with when it was shown and answered", () => {
    const host = new Host()
    host.now = 1_000
    host.begin([PICK, AUTHORED])
    host.now = 4_000
    host.send({ type: "answer", answer: RIGHT })
    expect(currentOutcome(host.state)).toMatchObject({
      shownAt: 1_000,
      answeredAt: 4_000,
    })
    host.now = 9_000
    host.send({ type: "next" })
    expect(host.effects[0]).toEqual({ type: "closed", index: 0, at: 9_000 })
  })

  it("steps down after a miss, stopping at the first right answer", () => {
    const host = new Host()
    host.begin([PICK])
    host.send({ type: "answer", answer: WRONG })
    expect(host.state.phase).toEqual({ name: "step-down", step: 0 })
    expect(currentOutcome(host.state)?.chosen).toBe("eseo-for-e")
    host.send({ type: "probe", answer: "past" })
    expect(host.state.phase).toEqual({ name: "step-down", step: 1 })
    host.send({ type: "probe", answer: "1" })
    expect(host.state.phase.name).toBe("reveal")
    expect(currentOutcome(host.state)).toMatchObject({
      probes: [
        { rung: 4, answer: "past", right: false },
        { rung: 1, answer: "1", right: true },
      ],
      floor: 1,
    })
  })

  it("says how the step-down ended: run out at floor zero, skipped, or timed out", () => {
    const out = new Host()
    out.begin([PICK])
    out.send({ type: "answer", answer: WRONG })
    out.send({ type: "probe", answer: "past" })
    out.send({ type: "probe", answer: "0" })
    expect(currentOutcome(out.state)).toMatchObject({
      stepDown: "ran-out",
      floor: 0,
    })
    const skip = new Host()
    skip.begin([PICK])
    skip.send({ type: "answer", answer: WRONG })
    skip.send({ type: "skip-probes" })
    expect(skip.state.phase.name).toBe("reveal")
    expect(currentOutcome(skip.state)).toMatchObject({
      stepDown: "skipped",
      floor: null,
    })
    const late = new Host()
    late.begin([PICK])
    late.send({ type: "answer", answer: WRONG })
    late.expire()
    expect(currentOutcome(late.state)).toMatchObject({
      stepDown: "expired",
      floor: null,
    })
  })

  it("offers the situation check on alternate right answers, and lets it change", () => {
    const host = new Host()
    host.begin([PICK, PICK, PICK])
    host.send({ type: "answer", answer: RIGHT })
    expect(currentOutcome(host.state)?.situation).toEqual({ chosen: null })
    host.send({ type: "situation", chosen: 2 })
    host.send({ type: "situation", chosen: 0 })
    expect(currentOutcome(host.state)?.situation).toEqual({ chosen: 0 })
    host.send({ type: "next" })
    host.send({ type: "answer", answer: RIGHT })
    expect(currentOutcome(host.state)?.situation).toBeNull()
    host.send({ type: "next" })
    host.send({ type: "answer", answer: RIGHT })
    expect(currentOutcome(host.state)?.situation).toEqual({ chosen: null })
  })

  it("bounds every screen: an item expires, the reveal moves on, the summary exits", () => {
    const host = new Host()
    host.begin([PICK, AUTHORED])
    host.expire()
    expect(host.state.phase.name).toBe("reveal")
    expect(currentOutcome(host.state)).toMatchObject({
      expired: true,
      answer: null,
    })
    host.expire()
    expect(host.state).toMatchObject({ cursor: 1, phase: { name: "item" } })
    host.send({ type: "answer", answer: { kind: "fine" } })
    host.send({ type: "next" })
    expect(host.state.phase.name).toBe("summary")
    host.expire()
    expect(host.effects).toEqual([{ type: "exit" }])
  })

  it("pauses on a hidden page with no clock, and gives the screen its two minutes when shown", () => {
    const host = new Host()
    host.begin([PICK])
    const seq = host.state.seq
    host.send({ type: "hidden" })
    expect(host.state.phase).toEqual({
      name: "paused",
      by: "hidden",
      resume: { name: "item" },
      since: 0,
    })
    expect(host.effects).toEqual([{ type: "stop-speech" }])
    host.send({ type: "elapsed", seq })
    expect(host.state.phase.name).toBe("paused")
    host.send({ type: "shown" })
    expect(host.state.phase.name).toBe("item")
    expect(host.effects).toEqual([
      { type: "wait", seq: host.state.seq, ms: MAX_SCREEN_MS },
    ])
    // Shown again with nothing paused, the clock is left alone.
    host.send({ type: "shown" })
    expect(host.effects).toEqual([])
  })

  it("leaves an item's pauses out of its time to answer", () => {
    const host = new Host()
    host.begin([PICK])
    host.now = 1_000
    host.send({ type: "hidden" })
    host.now = 5_000
    host.send({ type: "shown" })
    expect(currentOutcome(host.state)?.pausedMs).toBe(4_000)
  })

  it("bounds a pause on screen: two minutes held end the sitting", () => {
    const host = new Host()
    host.begin([PICK, PICK])
    host.send({ type: "held" })
    expect(host.effects).toEqual([
      { type: "stop-speech" },
      { type: "wait", seq: host.state.seq, ms: MAX_SCREEN_MS },
    ])
    host.send({ type: "hidden" })
    expect(host.state.phase).toMatchObject({ name: "paused", by: "hidden" })
    host.send({ type: "held" })
    host.expire()
    expect(host.state).toMatchObject({
      cursor: 0,
      phase: { name: "sitting-over", resume: null },
    })
    host.send({ type: "start-sitting" })
    expect(host.state).toMatchObject({ cursor: 0, phase: { name: "item" } })
  })

  it("ends the sitting on a pause past thirty minutes, keeping an answered item", () => {
    const host = new Host()
    host.begin([PICK, PICK])
    host.send({ type: "answer", answer: RIGHT })
    host.now = SITTING_MS
    host.send({ type: "hidden" })
    expect(host.state).toMatchObject({
      cursor: 0,
      phase: { name: "sitting-over", resume: { name: "reveal" } },
    })
    expect(currentOutcome(host.state)?.right).toBe(true)
    host.send({ type: "start-sitting" })
    expect(host.state).toMatchObject({ cursor: 0, phase: { name: "reveal" } })
  })

  it("resumes a step-down a held pause cut off, and begins an unanswered item again", () => {
    const host = new Host()
    host.begin([PICK, PICK])
    host.send({ type: "answer", answer: WRONG })
    host.send({ type: "held" })
    host.expire()
    expect(host.state.phase).toEqual({
      name: "sitting-over",
      resume: { name: "step-down", step: 0 },
    })
    host.send({ type: "start-sitting" })
    expect(host.state).toMatchObject({
      cursor: 0,
      phase: { name: "step-down", step: 0 },
    })
  })

  it("finishes the item showing at thirty minutes, then begins nothing new", () => {
    const host = new Host()
    host.begin([PICK, PICK])
    host.now = SITTING_MS
    host.send({ type: "answer", answer: WRONG })
    expect(host.state.phase.name).toBe("step-down")
    host.send({ type: "skip-probes" })
    expect(host.state.phase.name).toBe("reveal")
    host.send({ type: "next" })
    expect(host.state.phase.name).toBe("sitting-over")
    host.send({ type: "start-sitting" })
    expect(host.state).toMatchObject({ cursor: 1, phase: { name: "item" } })
  })

  it("begins no summary past thirty minutes, and enters it with the next sitting", () => {
    const host = new Host()
    host.begin([AUTHORED])
    host.send({ type: "answer", answer: { kind: "fine" } })
    host.now = SITTING_MS
    host.send({ type: "next" })
    expect(host.state.phase.name).toBe("sitting-over")
    host.send({ type: "start-sitting" })
    expect(host.state.phase.name).toBe("summary")
    expect(host.effects[0]).toEqual({ type: "stop-speech" })
  })

  it("asks for the next set from the summary", () => {
    const host = new Host()
    host.begin([AUTHORED])
    host.send({ type: "answer", answer: { kind: "fine" } })
    host.send({ type: "next" })
    host.send({ type: "next-set" })
    expect(host.state.phase.name).toBe("idle")
    expect(host.effects).toEqual([{ type: "request-set" }])
  })
})

describe("lensSummary", () => {
  it("counts by catalogue entry shown, judges as authored apart, expiries not at all", () => {
    const host = new Host()
    host.begin([PICK, AUTHORED, PICK])
    host.send({ type: "answer", answer: WRONG })
    host.send({ type: "skip-probes" })
    host.send({ type: "next" })
    host.send({ type: "answer", answer: { kind: "fine" } })
    host.send({ type: "next" })
    host.expire()
    host.expire()
    expect(lensSummary(host.state)).toEqual({
      right: 1,
      answered: 2,
      entries: [{ mistake: "eseo-for-e", right: 0, wrong: 1 }],
      asWritten: { right: 1, answered: 1 },
    })
  })
})
