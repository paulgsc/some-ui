import type { ConversationBatch, Message, Probe } from "@topik/lib/topik"
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
  probeFingerprint,
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

const probe = (
  id: string,
  source: string,
  extra: { anchorMessageId?: string } = {}
): Probe => ({
  id,
  kind: "pick-valid",
  order: 3,
  source,
  prompt: `about ${source}`,
  options: [
    { text: "a", relation: "reply", valid: true, why: "fits" },
    { text: "b", relation: "reply", valid: false, why: "does not" },
  ],
  ...extra,
})

const batch: ConversationBatch = {
  id: 1,
  messages: [
    message("m1", "안녕하세요, 저는 민수예요."),
    message("m2", "오늘 날씨가 정말 좋네요."),
    message("m3", "같이 산책할까요?"),
  ],
  // First-order items: the desktop's, never asked on this surface (Cor. 4.5).
  questions: [
    {
      type: "multiple-choice",
      korean: "안녕하세요",
      question: "What does this mean?",
      options: ["Hello", "Bye"],
      correct: 0,
      correctAnswer: "Hello",
      explanation: "",
    },
  ],
  probes: [
    probe("p0", "날씨가 정말 좋네요"), // anchors to m2 by containment
    probe("p1", "unrelated"), // falls back to the last line
    probe("p2", "", { anchorMessageId: "m1" }), // declared
  ],
}

const plan = planConversation(batch)

/** The fixture's probes are named for their order: p0, p1, p2. */
const id = (n: number): string => `p${n}`

/** How a probe's result is keyed once persisted: id at its version. */
const stored = (probeId: string): string => {
  const step = plan.steps.find(
    (candidate) => candidate.kind === "check" && candidate.id === probeId
  )
  return step?.kind === "check" ? `${probeId}@${step.fingerprint}` : probeId
}
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
    expect(anchorOf({ anchorMessageId: "m1" }, batch.messages)).toBe(0)
    expect(anchorOf({ excerpt: "날씨가 정말 좋네요" }, batch.messages)).toBe(1)
    expect(anchorOf({ excerpt: "unrelated" }, batch.messages)).toBe(2)
  })

  it("ignores a declared anchor that no longer resolves", () => {
    expect(
      anchorOf(
        { anchorMessageId: "gone", excerpt: "같이 산책할까요" },
        batch.messages
      )
    ).toBe(2)
  })
})

describe("planConversation", () => {
  it("puts each check right after the line it is about", () => {
    expect(
      plan.steps.map((s) => (s.kind === "line" ? `L${s.message}` : s.id))
    ).toEqual(["L0", "p2", "L1", "p0", "L2", "p1"])
    expect(plan.lineCount).toBe(3)
    expect(plan.checkCount).toBe(3)
  })

  it("never plans a first-order question: no probes is a listening lesson", () => {
    const { probes: _none, ...listening } = batch
    const bare = planConversation(listening)
    expect(bare.checkCount).toBe(0)
    expect(bare.steps.every((s) => s.kind === "line")).toBe(true)
  })

  it("delivers a duplicated id once, and leaves out a build it cannot tile", () => {
    const plan2 = planConversation({
      ...batch,
      probes: [
        probe("dup", "날씨가"),
        probe("dup", "산책"),
        {
          id: "b1",
          kind: "build",
          order: 2,
          source: "산책",
          prompt: "Say it",
          relation: "negation",
          target: "no",
        },
      ],
    })
    expect(plan2.checkCount).toBe(1)
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
      id: "p2",
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
      answer(false), // p2 missed
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
      id: "p2",
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
    // L0 -> p2 (missed) -> L1, then back to L0 and forward again.
    const revisited = run([
      { type: "NEXT" },
      answer(false),
      { type: "NEXT" },
      { type: "PREV" },
      { type: "NEXT" },
    ])
    // Straight to L1, not back into p2.
    expect(currentStep(plan, revisited)).toMatchObject({
      kind: "line",
      message: 1,
    })
    // The first try and the review queue are exactly as the first answer left them.
    expect(revisited.firstTry).toEqual({ p2: false })
    expect(revisited.review).toEqual(["p2"])
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
      questions: [],
      probes: [probe("a", "감사합니다"), probe("b", "카드로 할게요")],
    })
    expect(glossUnlocked(twoOnOne, { firstTry: {} }, 0)).toBe(false)
    expect(glossUnlocked(twoOnOne, { firstTry: { a: true } }, 0)).toBe(false)
    expect(
      glossUnlocked(twoOnOne, { firstTry: { a: true, b: false } }, 0)
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
        outcomes: outcomesOf(before, plan),
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
          firstTry: { [stored("p2")]: true, "gone@x": false },
          review: [stored("p2"), "gone@x", stored("p0")],
        },
      },
    ])
    expect(resumed.firstTry).toEqual({ p2: true })
    expect(resumed.review).toEqual([])
  })

  it("restarts clean when the line itself no longer resolves", () => {
    const resumed = run([
      {
        type: "RESUME",
        conversation: 0,
        message: 99,
        outcomes: {
          firstTry: { [stored("p2")]: false },
          review: [stored("p2")],
        },
      },
    ])
    expect(resumed).toEqual(createLessonState(true, 0))
  })
})

describe("check identity and once-only repeats (Codex, #1544)", () => {
  it("keys results by probe id, so a reordered file keeps each result on its probe", () => {
    const answered = run([{ type: "NEXT" }, answer(false)]) // p2 missed
    const reordered: ConversationBatch = {
      ...batch,
      probes: [...(batch.probes ?? [])].reverse(),
    }
    const resumed = lessonReducer(
      createLessonState(true),
      {
        type: "RESUME",
        conversation: 0,
        message: 0,
        outcomes: outcomesOf(answered, plan),
      },
      { ...ctx(), plan: planConversation(reordered) }
    )
    expect(resumed.firstTry).toEqual({ p2: false })
    expect(resumed.review).toEqual(["p2"])
  })

  it("serves a missed check's repeat once, even across a reload", () => {
    // Miss p2, answer the rest, reach the repeat, answer it.
    const atRepeat = run([
      { type: "NEXT" },
      answer(false),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
      { type: "NEXT" },
      answer(true),
      { type: "NEXT" },
    ])
    const repeated = run([answer(true)], atRepeat)
    expect(repeated.reviewed).toEqual([id(2)])
    // No second answer to the same repeat.
    expect(run([answer(false)], { ...repeated, answered: null })).toEqual({
      ...repeated,
      answered: null,
    })

    // A reload lands on the last line; forward goes straight to the wrap.
    const reloaded = run([
      {
        type: "RESUME",
        conversation: 0,
        message: 2,
        outcomes: outcomesOf(repeated, plan),
      },
      { type: "NEXT" },
    ])
    expect(currentStep(plan, reloaded)).toEqual({ kind: "wrap" })
    expect(tallyOf(plan, reloaded)).toMatchObject({ firstTry: 2, revisited: 1 })
  })
})

describe("probe versions (canon Thm. 1.1; carried over from #1544)", () => {
  it("fingerprints what is asked and what counts as right, not the wording around it", () => {
    const base = batch.probes![0]!
    expect(base.kind).toBe("pick-valid")
    if (base.kind === "build") return
    const [first, ...rest] = base.options
    expect(probeFingerprint({ ...base, explanation: "reworded" })).toBe(
      probeFingerprint(base)
    )
    expect(
      probeFingerprint({
        ...base,
        options: [{ ...first!, why: "another reason" }, ...rest],
      })
    ).toBe(probeFingerprint(base))
    expect(
      probeFingerprint({
        ...base,
        options: [{ ...first!, valid: !first!.valid }, ...rest],
      })
    ).not.toBe(probeFingerprint(base))
  })

  it("does not restore a result onto a probe edited under the same id", () => {
    const answered = run([{ type: "NEXT" }, answer(false)]) // p2 missed
    const edited: ConversationBatch = {
      ...batch,
      probes: batch.probes!.map((candidate) =>
        candidate.id === "p2"
          ? { ...candidate, prompt: "a new question" }
          : candidate
      ),
    }
    const resumed = lessonReducer(
      createLessonState(true),
      {
        type: "RESUME",
        conversation: 0,
        message: 0,
        outcomes: outcomesOf(answered, plan),
      },
      { ...ctx(), plan: planConversation(edited) }
    )
    expect(resumed.firstTry).toEqual({})
    expect(resumed.review).toEqual([])
  })
})
