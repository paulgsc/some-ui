import type { ConversationBatch, Message, Question } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import type { LessonContext, LessonEvent, LessonState } from "."
import {
  anchorOf,
  createLessonState,
  currentStep,
  glossUnlocked,
  lessonReducer,
  outcomesOf,
  planConversation,
  progressOf,
  tallyOf,
} from "."

const message = (id: string, korean: string): Message => ({
  id,
  role: "assistant",
  content: korean,
  timestamp: "00:00",
  korean,
  english: `gloss of ${id}`,
})

const question = (korean: string, extra: Partial<Question> = {}): Question => ({
  type: "multiple-choice",
  korean,
  question: `about ${korean}`,
  options: ["a", "b"],
  correct: 0,
  correctAnswer: "a",
  explanation: "because",
  ...extra,
})

const batch: ConversationBatch = {
  id: 1,
  messages: [
    message("m1", "안녕하세요, 저는 민수예요."),
    message("m2", "오늘 날씨가 정말 좋네요."),
    message("m3", "같이 산책할까요?"),
  ],
  questions: [
    question("날씨가 정말 좋네요"), // anchors to m2 by containment
    question("unrelated"), // falls back to the last line
    question("", { anchorMessageId: "m1" }), // declared
  ],
}

const plan = planConversation(batch)
const ctx = (audio = true): LessonContext => ({
  plan,
  conversationCount: 2,
  audio,
})

const run = (
  events: Array<LessonEvent>,
  state: LessonState = createLessonState(true),
  context: LessonContext = ctx()
): LessonState =>
  events.reduce((s, event) => lessonReducer(s, event, context), state)

const answer = (correct: boolean): LessonEvent => ({
  type: "ANSWER",
  correct,
  response: "x",
  channel: "selection",
})

describe("anchorOf", () => {
  it("prefers a declared anchor, then containment, then the last line", () => {
    expect(anchorOf(batch.questions[2]!, batch.messages)).toBe(0)
    expect(anchorOf(batch.questions[0]!, batch.messages)).toBe(1)
    expect(anchorOf(batch.questions[1]!, batch.messages)).toBe(2)
  })

  it("ignores a declared anchor that no longer resolves", () => {
    const orphan = question("같이 산책할까요", { anchorMessageId: "gone" })
    expect(anchorOf(orphan, batch.messages)).toBe(2)
  })
})

describe("planConversation", () => {
  it("puts each check right after the line it is about", () => {
    expect(
      plan.steps.map((s) =>
        s.kind === "line" ? `L${s.message}` : `Q${s.question}`
      )
    ).toEqual(["L0", "Q2", "L1", "Q0", "L2", "Q1"])
    expect(plan.lineCount).toBe(3)
    expect(plan.checkCount).toBe(3)
  })
})

describe("lessonReducer", () => {
  it("climbs the ladder from audio, and withholds the gloss until the line's checks are answered", () => {
    const state = run([
      { type: "REVEAL" },
      { type: "REVEAL" },
      { type: "REVEAL" },
    ])
    expect(state.reveal).toBe(1)
  })

  it("starts at Hangul when the renderer cannot speak", () => {
    expect(createLessonState(false).reveal).toBe(1)
  })

  it("will not leave an unanswered check", () => {
    const atCheck = run([{ type: "NEXT" }])
    expect(currentStep(plan, atCheck)).toMatchObject({
      kind: "check",
      question: 2,
    })
    expect(run([{ type: "NEXT" }], atCheck)).toBe(atCheck)
  })

  it("records the anchor line's rung on the outcome", () => {
    const state = run([{ type: "REVEAL" }, { type: "NEXT" }, answer(true)])
    expect(state.answered).toMatchObject({ correct: true, anchorReveal: 1 })
  })

  it("unlocks a line's gloss once its checks are answered", () => {
    const back = run([
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
      { type: "PREV" },
      { type: "REVEAL" },
      { type: "REVEAL" },
    ])
    expect(currentStep(plan, back)).toMatchObject({ kind: "line", message: 0 })
    expect(back.reveal).toBe(2)
  })

  it("does not step back from a check", () => {
    const atCheck = run([{ type: "NEXT" }])
    expect(run([{ type: "PREV" }], atCheck)).toBe(atCheck)
  })

  it("re-presents a missed check once after the last line, then wraps", () => {
    let state = run([
      { type: "NEXT" },
      answer(false), // Q2 missed
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
    ])
    expect(currentStep(plan, state)).toMatchObject({
      kind: "check",
      question: 2,
      repeat: true,
      anchor: 0,
    })

    state = run([answer(false), { type: "NEXT" }], state)
    expect(currentStep(plan, state)).toEqual({ kind: "wrap" })
    // The repeat does not rewrite the first-try record, nor queue again.
    expect(tallyOf(plan, state)).toEqual({
      firstTry: 2,
      answered: 3,
      total: 3,
      revisited: 1,
    })
    expect(progressOf(plan, state)).toBe(1)
  })

  it("moves to the next conversation from the wrap, and finishes after the last", () => {
    const wrap = run([
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
    ])
    expect(currentStep(plan, wrap)).toEqual({ kind: "wrap" })

    const second = run([{ type: "NEXT_CONVERSATION" }], wrap)
    expect(second).toEqual(createLessonState(true, 1))

    const secondWrap = { ...wrap, conversation: 1 }
    expect(run([{ type: "NEXT_CONVERSATION" }], secondWrap).finished).toBe(true)
  })

  it("resumes at a line by message index, and to the start when it does not resolve", () => {
    const resumed = run([{ type: "RESUME", conversation: 0, message: 2 }])
    expect(currentStep(plan, resumed)).toMatchObject({
      kind: "line",
      message: 2,
    })
    expect(run([{ type: "RESUME", conversation: 0, message: 99 }]).step).toBe(0)
    const out = createLessonState(true)
    expect(run([{ type: "RESUME", conversation: 5, message: 0 }], out)).toBe(
      out
    )
  })

  it("passes over a check already answered when a line is revisited (Codex, #1544)", () => {
    // L0 -> Q2 (missed) -> L1, then back to L0 and forward again.
    const revisited = run([
      { type: "NEXT" },
      answer(false),
      { type: "NEXT" },
      { type: "PREV" },
      { type: "NEXT" },
    ])
    // Straight to L1, not back into Q2.
    expect(currentStep(plan, revisited)).toMatchObject({
      kind: "line",
      message: 1,
    })
    // The first try and the review queue are exactly as the first answer left them.
    expect(revisited.firstTry).toEqual({ 2: false })
    expect(revisited.review).toEqual([2])
  })

  it("refuses a second first-try answer even if a check is reached again", () => {
    const answered = run([{ type: "NEXT" }, answer(true)])
    const forcedBack = { ...answered, answered: null }
    expect(run([answer(false)], forcedBack)).toBe(forcedBack)
  })
})

describe("glossUnlocked", () => {
  it("waits for every check anchored to the line, not just the first (Codex, #1544)", () => {
    const twoOnOne = planConversation({
      id: 9,
      messages: [message("x1", "카드로 할게요. 감사합니다.")],
      questions: [question("감사합니다"), question("카드로 할게요")],
    })
    expect(glossUnlocked(twoOnOne, { firstTry: {} }, 0)).toBe(false)
    expect(glossUnlocked(twoOnOne, { firstTry: { 0: true } }, 0)).toBe(false)
    expect(
      glossUnlocked(twoOnOne, { firstTry: { 0: true, 1: false } }, 0)
    ).toBe(true)
  })
})

describe("resume outcomes (Codex, #1544)", () => {
  it("round-trips a conversation's results through a resume", () => {
    // p2 anchored to L0 missed, p0 on L1 answered right; the learner is on L2.
    const before = run([
      { type: "NEXT" },
      answer(false),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
    ])
    const resumed = run([
      {
        type: "RESUME",
        conversation: 0,
        message: 1,
        outcomes: outcomesOf(before),
      },
    ])
    expect(resumed.firstTry).toEqual(before.firstTry)
    expect(resumed.review).toEqual(before.review)
    // Resumed at L1: its answered check is passed over, not re-asked.
    expect(currentStep(plan, run([{ type: "NEXT" }], resumed))).toMatchObject({
      kind: "line",
      message: 2,
    })
  })

  it("drops keys the content no longer has, and reviews nothing not missed", () => {
    const resumed = run([
      {
        type: "RESUME",
        conversation: 0,
        message: 0,
        outcomes: {
          firstTry: { "2": true, "7": false },
          review: ["2", "7", "0"],
        },
      },
    ])
    expect(resumed.firstTry).toEqual({ 2: true })
    expect(resumed.review).toEqual([])
  })

  it("restarts clean when the line itself no longer resolves", () => {
    const resumed = run([
      {
        type: "RESUME",
        conversation: 0,
        message: 99,
        outcomes: { firstTry: { "2": false }, review: ["2"] },
      },
    ])
    expect(resumed).toEqual(createLessonState(true, 0))
  })
})
