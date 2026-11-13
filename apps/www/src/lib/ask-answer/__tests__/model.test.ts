/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"

import type { AnswerEvent, AnswerState } from "@/lib/ask-answer/model"
import { initialAnswer, step } from "@/lib/ask-answer/model"

const run = (events: ReadonlyArray<AnswerEvent>): AnswerState =>
  events.reduce((state, event) => step(state, event).state, initialAnswer)

const ready: ReadonlyArray<AnswerEvent> = [
  { type: "opened" },
  { type: "voiceChecked", available: true },
]

const take = (seq: number): ReadonlyArray<AnswerEvent> => [
  { type: "talk" },
  { type: "ready", seq },
  { type: "stopTalking" },
  { type: "hearing", seq },
]

describe("an ask's answer", () => {
  it("checks the voice on opening, and says nothing until it may listen", () => {
    expect(step(initialAnswer, { type: "opened" }).effects).toEqual([
      { type: "checkVoice" },
    ])
    expect(step(initialAnswer, { type: "talk" }).effects).toEqual([])
    expect(
      run([{ type: "voiceChecked", available: false }, { type: "talk" }]).phase
    ).toEqual({ kind: "idle" })
  })

  it("records one take, stops it on Done talking, and shows home's words", () => {
    const talking = step(run(ready), { type: "talk" })
    expect(talking.effects).toEqual([{ type: "listen", seq: 1 }])
    expect(
      step(run([...ready, { type: "talk" }]), { type: "stopTalking" }).effects
    ).toEqual([{ type: "stopListening" }])
    expect(
      run([
        ...ready,
        ...take(1),
        {
          type: "listened",
          seq: 1,
          result: { kind: "heard", words: "the second" },
        },
      ]).phase
    ).toEqual({ kind: "heard", words: "the second" })
  })

  it("says each way a take ends", () => {
    const ending = (
      result: Extract<AnswerEvent, { type: "listened" }>["result"]
    ): AnswerState =>
      run([...ready, ...take(1), { type: "listened", seq: 1, result }])
    expect(ending({ kind: "heard", words: " " }).notice).toBe("silent")
    expect(ending({ kind: "kept", on: "phone", why: "away" }).phase).toEqual({
      kind: "kept",
      on: "phone",
      why: "away",
    })
    expect(ending({ kind: "unavailable" }).voice).toBe("unavailable")
    expect(ending({ kind: "notStarted" }).notice).toBe("notStarted")
    expect(ending({ kind: "failed" }).notice).toBe("notKept")
    expect(ending({ kind: "notKept", why: "full" }).notice).toBe("full")
    expect(ending({ kind: "refused", reason: "denied" }).notice).toEqual({
      refused: "denied",
    })
  })

  it("lets a result for an earlier take change nothing, and answers again", () => {
    const first = run([
      ...ready,
      ...take(1),
      { type: "listened", seq: 1, result: { kind: "heard", words: "one" } },
      ...take(2),
    ])
    const late = step(first, {
      type: "listened",
      seq: 1,
      result: { kind: "heard", words: "stale" },
    })
    expect(late.state).toBe(first)
    expect(first.phase).toEqual({ kind: "hearing", seq: 2 })
  })

  it("ends a take when the page hides, and keeps it when the screen goes", () => {
    const hid = step(run([...ready, { type: "talk" }]), { type: "hidden" })
    expect(hid.state.phase).toEqual({ kind: "finishing", seq: 1 })
    expect(hid.effects).toEqual([{ type: "stopListening" }])
    const left = step(run([...ready, { type: "talk" }]), { type: "left" })
    expect(left.state.phase).toEqual({ kind: "idle" })
    expect(left.effects).toEqual([{ type: "cancelListening" }])
    expect(step(run(ready), { type: "left" }).effects).toEqual([])
  })

  it("says another answer while home hears the last, and none unpaired", () => {
    expect(run([...ready, ...take(1), { type: "talk" }]).phase).toEqual({
      kind: "recording",
      seq: 2,
      ready: false,
    })
    const unpaired = run([{ type: "opened" }, { type: "unpaired" }])
    expect(unpaired.voice).toBe("unpaired")
    expect(step(unpaired, { type: "talk" }).effects).toEqual([])
  })
})
