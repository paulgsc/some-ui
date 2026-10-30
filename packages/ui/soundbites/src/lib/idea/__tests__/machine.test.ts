/** @vitest-environment node */
import type {
  IdeaEvent,
  IdeaIntent,
  IdeaState,
} from "@soundbites/lib/idea/machine"
import { apply, initialIdeaState, step } from "@soundbites/lib/idea/machine"
import type { Idea } from "@soundbites/lib/idea/model"
import { grows, openQuestion } from "@soundbites/lib/idea/model"
import { describe, expect, it } from "vitest"

const AT = "2026-10-30T10:00:00.000Z"

/** Runs events through `step`, applying each keep to `ideas` as a store would. */
function run(
  events: ReadonlyArray<IdeaEvent>,
  start: IdeaState = initialIdeaState("idea-1"),
  ideas: Array<Idea> = []
): { state: IdeaState; ideas: ReadonlyArray<Idea>; listens: Array<number> } {
  let state = start
  let kept: ReadonlyArray<Idea> = ideas
  const listens: Array<number> = []
  const queue = [...events]
  while (queue.length > 0) {
    const event = queue.shift()
    if (event === undefined) break
    const next = step(state, event)
    state = next.state
    for (const effect of next.effects) {
      if (effect.type === "keep") {
        const after = apply(kept, effect.op, effect.at)
        expect(grows(kept, after)).toBe(true)
        kept = after
        queue.unshift({ type: "kept", ideas: kept })
      }
      if (effect.type === "listen") listens.push(effect.seq)
    }
  }
  return { state, ideas: kept, listens }
}

const tap = (intent: Exclude<IdeaIntent, { type: "another" }>): IdeaEvent => ({
  ...intent,
  at: AT,
})

const OPENED: ReadonlyArray<IdeaEvent> = [
  { type: "entered", at: AT },
  { type: "listed", ideas: [] },
  { type: "voiceChecked", available: true },
]

function screenOf(state: IdeaState): string {
  const { screen } = state
  return screen.kind === "ask"
    ? `ask:${screen.question}:${screen.phase.kind}`
    : screen.kind
}

describe("catching an idea", () => {
  it("opens at the first question, ready to talk", () => {
    expect(screenOf(run(OPENED).state)).toBe("ask:what:idle")
  })

  it("shows the words as they're heard, and keeps them once they're right", () => {
    const { state, ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "a short" },
      { type: "partial", seq: 1, words: "a short about bites" },
      { type: "listened", seq: 1, result: { kind: "heard", words: "" } },
      tap({ type: "right" }),
    ])
    expect(ideas).toHaveLength(1)
    expect(ideas[0]?.answers[0]?.versions).toEqual([
      { at: AT, how: "heard", words: "a short about bites" },
    ])
    expect(screenOf(state)).toBe("ask:takeaway:idle")
  })

  it("keeps the words first heard beside a fix", () => {
    const { ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "a shirt" } },
      tap({ type: "fix" }),
      tap({ type: "draft", text: "a short" }),
      tap({ type: "save" }),
    ])
    const [answer] = ideas[0]?.answers ?? []
    expect(answer?.versions.map((version) => version.how)).toEqual([
      "heard",
      "fixed",
    ])
    expect(answer?.versions.at(-1)?.words).toBe("a short")
  })

  it("keeps nothing it heard until it is confirmed", () => {
    const { ideas, listens } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "wrong" } },
      tap({ type: "talk" }),
      { type: "listened", seq: 2, result: { kind: "heard", words: "right" } },
    ])
    expect(ideas).toEqual([])
    expect(listens).toEqual([1, 2])
  })

  it("ignores what an earlier listening hears", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      tap({ type: "type" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "late" } },
    ])
    expect(screenOf(state)).toBe("ask:what:typing")
  })

  it("takes typed words when the phone can't listen", () => {
    const { state, ideas } = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [] },
      { type: "voiceChecked", available: false },
      tap({ type: "talk" }),
      tap({ type: "draft", text: "typed idea" }),
      tap({ type: "save" }),
    ])
    expect(ideas[0]?.answers[0]?.versions[0]?.how).toBe("typed")
    expect(screenOf(state)).toBe("ask:takeaway:typing")
  })

  it("turns to typing, keeping what it heard, when listening is unavailable", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "partial", seq: 1, words: "half" },
      { type: "listened", seq: 1, result: { kind: "unavailable" } },
    ])
    expect(state.voice).toBe("unavailable")
    expect(state.screen).toMatchObject({
      phase: { kind: "typing", draft: "half" },
    })
  })

  it("says nothing was heard, and stays on the question", () => {
    const { state } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: " " } },
    ])
    expect(screenOf(state)).toBe("ask:what:idle")
    expect(state.notice).toBe("notHeard")
  })

  it("never skips the first question, and skips the others", () => {
    const first = run([...OPENED, tap({ type: "skip" })])
    expect(screenOf(first.state)).toBe("ask:what:idle")

    const { state, ideas } = run([
      ...OPENED,
      tap({ type: "talk" }),
      { type: "listened", seq: 1, result: { kind: "heard", words: "idea" } },
      tap({ type: "right" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    expect(screenOf(state)).toBe("kept")
    expect(ideas[0]?.passed).toEqual(["takeaway", "spark", "picture"])
  })

  it("answers a skipped question later, from the kept screen", () => {
    const skipped = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
      tap({ type: "save" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    const { state, ideas } = run(
      [
        tap({ type: "answerSkipped" }),
        tap({ type: "type" }),
        tap({ type: "draft", text: "the point" }),
        tap({ type: "save" }),
      ],
      skipped.state,
      [...skipped.ideas]
    )
    expect(screenOf(state)).toBe("kept")
    expect(ideas[0]?.answers.map((answer) => answer.question)).toEqual([
      "what",
      "takeaway",
    ])
  })

  it("resumes the newest idea still open, at its open question", () => {
    const open: Idea = {
      id: "idea-0",
      at: AT,
      questions: 1,
      answers: [
        { question: "what", versions: [{ at: AT, how: "typed", words: "x" }] },
      ],
      passed: ["takeaway"],
    }
    const { state } = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [open] },
    ])
    expect(state.ideaId).toBe("idea-0")
    expect(screenOf(state)).toBe("ask:spark:idle")
  })

  it("says so, and keeps the words on screen, when the phone refuses them", () => {
    const opened = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
    ]).state
    const saved = step(opened, tap({ type: "save" }))
    const refused = step(saved.state, { type: "kept", ideas: null })
    expect(refused.state.notice).toBe("notKept")
    expect(refused.state.screen).toMatchObject({
      phase: { kind: "typing", draft: "idea" },
    })
  })

  it("lets go of the listening when the screen goes", () => {
    const listening = run([...OPENED, tap({ type: "talk" })]).state
    expect(step(listening, { type: "left" }).effects).toEqual([
      { type: "cancelListening" },
    ])
  })

  it("offers an earlier idea's skipped questions on a new idea's first screen", () => {
    const earlier: Idea = {
      id: "idea-0",
      at: AT,
      questions: 1,
      answers: [
        { question: "what", versions: [{ at: AT, how: "typed", words: "x" }] },
      ],
      passed: ["takeaway", "spark", "picture"],
    }
    const opened = run([
      { type: "entered", at: AT },
      { type: "listed", ideas: [earlier] },
      { type: "voiceChecked", available: true },
    ])
    expect(opened.state.idea).toBeNull()
    expect(opened.state.skipped?.id).toBe("idea-0")
    const { state, ideas } = run(
      [
        tap({ type: "answerSkipped" }),
        tap({ type: "type" }),
        tap({ type: "draft", text: "the point" }),
        tap({ type: "save" }),
      ],
      opened.state,
      [earlier]
    )
    expect(ideas).toHaveLength(1)
    expect(ideas[0]?.answers.map((answer) => answer.question)).toEqual([
      "what",
      "takeaway",
    ])
    expect(screenOf(state)).toBe("kept")
  })

  it("starts another idea once one is kept", () => {
    const done = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
      tap({ type: "save" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    const next = step(done.state, { type: "another", at: AT, id: "idea-2" })
    expect(next.state.ideaId).toBe("idea-2")
    expect(next.state.idea).toBeNull()
    expect(screenOf(next.state)).toBe("ask:what:idle")
    expect(done.ideas[0] && openQuestion(done.ideas[0])).toBeNull()
  })
})
