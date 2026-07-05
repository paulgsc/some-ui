import type {
  ConversationBatch,
  Message,
  Question,
  SessionState,
} from "@chat/lib/topik"
import { describe, expect, it } from "vitest"

import {
  getAllMessages,
  getAllQuestions,
  getAvailableTopiks,
  getCurrentBatch,
  getCurrentMessage,
  getCurrentQuestion,
  getTopikMetadata,
  getVisibleMessages,
  selectors,
} from "./session-selectors"

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeMessage(id: string): Message {
  return {
    id,
    role: "assistant",
    content: `content-${id}`,
    timestamp: new Date(2024, 0, 1).toISOString(),
    korean: `한국어-${id}`,
    english: `english-${id}`,
  }
}

function makeQuestion(korean: string): Question {
  return {
    type: "multiple-choice",
    korean,
    question: `question-${korean}`,
    options: ["a", "b"],
    correct: 0,
    correctAnswer: "a",
    explanation: "because",
  }
}

function makeBatch(
  id: number,
  messages: Array<Message>,
  questions: Array<Question>
): ConversationBatch {
  return { id, messages, questions }
}

function baseState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    phase: "selecting",
    dataRef: {
      catalog: { status: "idle", data: null, error: null },
      topikKey: null,
      batches: null,
      status: "empty",
      error: null,
      batchCount: 0,
      currentBatchMeta: null,
    },
    active: null,
    feedback: null,
    hydrationEpoch: 0,
    sessionEpoch: 0,
    ...overrides,
  }
}

function activeState(
  batches: Array<ConversationBatch> | null,
  cursor: { batch: number; message: number; question: number }
): SessionState {
  return baseState({
    phase: "active",
    dataRef: {
      catalog: { status: "idle", data: null, error: null },
      topikKey: "k1",
      batches,
      status: batches ? "ready" : "empty",
      error: null,
      batchCount: batches?.length ?? 0,
      currentBatchMeta: null,
    },
    active: {
      mode: "chat",
      playState: "running",
      quizStage: "question",
      cursor,
      score: 0,
      timeRemaining: 0,
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// getCurrentBatch - precondition-based null guards
// ═══════════════════════════════════════════════════════════════════════════

describe("getCurrentBatch", () => {
  it("returns null when there is no active session", () => {
    const batch = makeBatch(0, [], [])
    const state = baseState({
      dataRef: {
        catalog: { status: "idle", data: null, error: null },
        topikKey: "k1",
        batches: [batch],
        status: "ready",
        error: null,
        batchCount: 1,
        currentBatchMeta: null,
      },
      active: null,
    })
    expect(getCurrentBatch(state)).toBeNull()
  })

  it("returns null when batches have not been hydrated", () => {
    const state = activeState(null, { batch: 0, message: 0, question: 0 })
    expect(getCurrentBatch(state)).toBeNull()
  })

  it("returns null when the cursor's batch index is out of range", () => {
    const batch = makeBatch(0, [], [])
    const state = activeState([batch], { batch: 5, message: 0, question: 0 })
    expect(getCurrentBatch(state)).toBeNull()
  })

  it("returns the batch at the cursor's batch index", () => {
    const batch0 = makeBatch(0, [], [])
    const batch1 = makeBatch(1, [], [])
    const state = activeState([batch0, batch1], {
      batch: 1,
      message: 0,
      question: 0,
    })
    expect(getCurrentBatch(state)).toBe(batch1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// getCurrentMessage / getCurrentQuestion - compound null guards
// ═══════════════════════════════════════════════════════════════════════════

describe("getCurrentMessage", () => {
  it("returns null when there is no current batch", () => {
    const state = activeState(null, { batch: 0, message: 0, question: 0 })
    expect(getCurrentMessage(state)).toBeNull()
  })

  it("returns null when the cursor's message index is out of range", () => {
    const batch = makeBatch(0, [makeMessage("m0")], [])
    const state = activeState([batch], { batch: 0, message: 3, question: 0 })
    expect(getCurrentMessage(state)).toBeNull()
  })

  it("returns the message at the cursor's message index", () => {
    const m0 = makeMessage("m0")
    const m1 = makeMessage("m1")
    const batch = makeBatch(0, [m0, m1], [])
    const state = activeState([batch], { batch: 0, message: 1, question: 0 })
    expect(getCurrentMessage(state)).toBe(m1)
  })
})

describe("getCurrentQuestion", () => {
  it("returns null when there is no current batch", () => {
    const state = activeState(null, { batch: 0, message: 0, question: 0 })
    expect(getCurrentQuestion(state)).toBeNull()
  })

  it("returns null when the cursor's question index is out of range", () => {
    const batch = makeBatch(0, [], [makeQuestion("q0")])
    const state = activeState([batch], { batch: 0, message: 0, question: 3 })
    expect(getCurrentQuestion(state)).toBeNull()
  })

  it("returns the question at the cursor's question index", () => {
    const q0 = makeQuestion("q0")
    const q1 = makeQuestion("q1")
    const batch = makeBatch(0, [], [q0, q1])
    const state = activeState([batch], { batch: 0, message: 0, question: 1 })
    expect(getCurrentQuestion(state)).toBe(q1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// getVisibleMessages - cumulative reveal up to the cursor
// ═══════════════════════════════════════════════════════════════════════════

describe("getVisibleMessages", () => {
  it("returns an empty array when there is no current batch", () => {
    const state = activeState(null, { batch: 0, message: 0, question: 0 })
    expect(getVisibleMessages(state)).toEqual([])
  })

  it("reveals messages from the start up through the cursor, inclusive", () => {
    const messages = [makeMessage("m0"), makeMessage("m1"), makeMessage("m2")]
    const batch = makeBatch(0, messages, [])
    const state = activeState([batch], { batch: 0, message: 1, question: 0 })
    expect(getVisibleMessages(state)).toEqual([messages[0], messages[1]])
  })

  it("caps at the full message list when the cursor is past the end", () => {
    const messages = [makeMessage("m0"), makeMessage("m1")]
    const batch = makeBatch(0, messages, [])
    const state = activeState([batch], { batch: 0, message: 99, question: 0 })
    expect(getVisibleMessages(state)).toEqual(messages)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// getAllMessages / getAllQuestions - ignore cursor entirely
// ═══════════════════════════════════════════════════════════════════════════

describe("getAllMessages / getAllQuestions", () => {
  it("return empty arrays when there is no current batch", () => {
    const state = activeState(null, { batch: 0, message: 0, question: 0 })
    expect(getAllMessages(state)).toEqual([])
    expect(getAllQuestions(state)).toEqual([])
  })

  it("return the full arrays regardless of cursor position", () => {
    const messages = [makeMessage("m0"), makeMessage("m1")]
    const questions = [makeQuestion("q0")]
    const batch = makeBatch(0, messages, questions)
    const state = activeState([batch], { batch: 0, message: 0, question: 0 })
    expect(getAllMessages(state)).toBe(messages)
    expect(getAllQuestions(state)).toBe(questions)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Catalog accessors
// ═══════════════════════════════════════════════════════════════════════════

describe("getAvailableTopiks / getTopikMetadata", () => {
  it("returns an empty array / undefined before the catalog loads", () => {
    const state = baseState()
    expect(getAvailableTopiks(state)).toEqual([])
    expect(getTopikMetadata(state, "t1")).toBeUndefined()
  })

  it("finds metadata by key once the catalog is loaded", () => {
    const t1 = {
      key: "t1",
      displayName: "Topik 1",
      description: "d",
      batchCount: 1,
      totalQuestions: 1,
      totalMessages: 1,
    }
    const state = baseState({
      dataRef: {
        catalog: { status: "ready", data: [t1], error: null },
        topikKey: null,
        batches: null,
        status: "empty",
        error: null,
        batchCount: 0,
        currentBatchMeta: null,
      },
    })
    expect(getAvailableTopiks(state)).toEqual([t1])
    expect(getTopikMetadata(state, "t1")).toEqual(t1)
    expect(getTopikMetadata(state, "missing")).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// selectors - mode/playState precondition guards
// ═══════════════════════════════════════════════════════════════════════════

describe("selectors - mode and play-state guards", () => {
  it("isActive/isInChat/isInQuiz/isChatPlaying/isChatPaused all false before hydration", () => {
    const state = baseState()
    expect(selectors.isActive(state)).toBe(false)
    expect(selectors.isInChat(state)).toBe(false)
    expect(selectors.isInQuiz(state)).toBe(false)
    expect(selectors.isChatPlaying(state)).toBe(false)
    expect(selectors.isChatPaused(state)).toBe(false)
  })

  it("reflects chat mode + running playState once active", () => {
    const batch = makeBatch(0, [], [])
    const state = activeState([batch], { batch: 0, message: 0, question: 0 })
    expect(selectors.isActive(state)).toBe(true)
    expect(selectors.isInChat(state)).toBe(true)
    expect(selectors.isInQuiz(state)).toBe(false)
    expect(selectors.isChatPlaying(state)).toBe(true)
    expect(selectors.isChatPaused(state)).toBe(false)
  })

  it("isChatPaused flips once playState is paused, without touching quiz selectors", () => {
    const batch = makeBatch(0, [], [])
    const state = activeState([batch], { batch: 0, message: 0, question: 0 })
    const paused: SessionState = {
      ...state,
      active: { ...state.active!, playState: "paused" },
    }
    expect(selectors.isChatPlaying(paused)).toBe(false)
    expect(selectors.isChatPaused(paused)).toBe(true)
    expect(selectors.isInQuiz(paused)).toBe(false)
  })
})
