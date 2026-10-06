/**
 * Covers the reducer invariants (V-numbers) in lib/topik/README.md → "Invariants
 * Enforced". V4, V14, V15, V16 and V19 are documented nowhere, so the
 * remaining branches (catalog lifecycle, quiz scoring, batch pass/fail, reset)
 * sit under plain behavioural `describe` blocks instead of an invented label.
 */
import type { ConversationBatch } from "@topik/lib/topik"
import type {
  BatchMetadata,
  SessionEvent,
  SessionState,
} from "@topik/lib/topik/core/session-types"
import { describe, expect, it } from "vitest"

import {
  createActiveState,
  createInitialState,
  isBatchesComplete,
  sessionReducer,
  validateCursor,
} from "."

function makeBatch(
  id: number,
  messageCount: number,
  questionCount: number
): ConversationBatch {
  return {
    id,
    messages: Array.from({ length: messageCount }, (_, i) => ({
      id: `m${id}-${i}`,
      role: i % 2 === 0 ? "assistant" : "user",
      content: `message ${i}`,
      timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
      korean: `한국어 ${i}`,
      english: `english ${i}`,
    })),
    questions: Array.from({ length: questionCount }, (_, i) => ({
      type: "multiple-choice" as const,
      korean: `질문 ${i}`,
      question: `question ${i}`,
      options: ["a", "b", "c"],
      correct: 0,
      correctAnswer: "a",
      explanation: `explanation ${i}`,
    })),
  }
}

function makeMeta(overrides: Partial<BatchMetadata> = {}): BatchMetadata {
  return { id: 0, messageCount: 3, questionCount: 2, ...overrides }
}

/** Applies each event in turn and returns the final state. */
function fold(
  state: SessionState,
  ...events: Array<SessionEvent>
): SessionState {
  return events.reduce((s, event) => sessionReducer(s, event).state, state)
}

const select = (key: string): SessionEvent => ({ type: "SELECT_TOPIK", key })
const CHANGE: SessionEvent = { type: "CHANGE_TOPIK" }
const PAUSE: SessionEvent = { type: "PAUSE_CHAT" }
const START_QUIZ: SessionEvent = { type: "START_QUIZ" }
const ANSWER_OK: SessionEvent = { type: "ANSWER_SUBMITTED", correct: true }
const ADVANCE_Q: SessionEvent = { type: "ADVANCE_QUESTION" }
const ADVANCE_M: SessionEvent = { type: "ADVANCE_MESSAGE" }
/** Answer the only question and land on the batch summary. */
const TO_SUMMARY = [START_QUIZ, ANSWER_OK, ADVANCE_Q]

/** SELECT_TOPIK -> HYDRATION_SUCCESS into "active". */
function hydrate(
  batches: Array<ConversationBatch> = [makeBatch(0, 3, 2)],
  key = "t1"
): SessionState {
  return fold(createInitialState(), select(key), {
    type: "HYDRATION_SUCCESS",
    key,
    batches,
  })
}

// Deterministic PRNG (mulberry32): reproducible without a new dependency.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe("createInitialState", () => {
  it("returns the selecting phase with empty data and zeroed epochs", () => {
    const state = createInitialState()

    expect(state.phase).toBe("selecting")
    expect(state.active).toBeNull()
    expect(state.feedback).toBeNull()
    expect(state.hydrationEpoch).toBe(0)
    expect(state.sessionEpoch).toBe(0)
    expect(state.dataRef).toEqual({
      catalog: { status: "idle", data: null, error: null },
      topikKey: null,
      batches: null,
      status: "empty",
      error: null,
      batchCount: 0,
      currentBatchMeta: null,
    })
  })

  it("returns a fresh object on every call", () => {
    expect(createInitialState()).not.toBe(createInitialState())
    expect(createInitialState()).toEqual(createInitialState())
  })
})

describe("validateCursor (V10: cursor bounds safety)", () => {
  it("returns the cursor unchanged when no metadata is available", () => {
    const cursor = { batch: 99, message: 99, question: 99 }
    expect(validateCursor(cursor, null, 0)).toBe(cursor)
  })

  it.each([
    [
      "clamps each field to its upper bound",
      { batch: 10, message: 10, question: 10 },
      { batch: 3, message: 4, question: 2 },
    ],
    [
      "leaves an already-in-bounds cursor untouched",
      { batch: 1, message: 2, question: 1 },
      { batch: 1, message: 2, question: 1 },
    ],
  ])("%s", (_, cursor, expected) => {
    const meta = makeMeta({ messageCount: 5, questionCount: 3 })
    expect(validateCursor(cursor, meta, 4)).toEqual(expected)
  })

  it("clamps negative values up to 0", () => {
    expect(
      validateCursor({ batch: -5, message: -1, question: -3 }, makeMeta(), 4)
    ).toEqual({ batch: 0, message: 0, question: 0 })
  })

  it("property: clamped cursor is always within [0, bound-1] for any cursor/metadata pair", () => {
    const rand = mulberry32(0xc0ffee)
    const randInt = (min: number, max: number): number =>
      Math.floor(rand() * (max - min + 1)) + min

    for (let i = 0; i < 500; i++) {
      const batchCount = randInt(0, 10)
      const messageCount = randInt(0, 10)
      const questionCount = randInt(0, 10)
      const meta = makeMeta({ messageCount, questionCount })

      const cursor = {
        batch: randInt(-20, 20),
        message: randInt(-20, 20),
        question: randInt(-20, 20),
      }

      const result = validateCursor(cursor, meta, batchCount)

      expect(result.batch).toBeGreaterThanOrEqual(0)
      expect(result.message).toBeGreaterThanOrEqual(0)
      expect(result.question).toBeGreaterThanOrEqual(0)

      // An empty bound clamps to -1 first, then floors back to 0.
      expect(result.batch).toBeLessThanOrEqual(Math.max(0, batchCount - 1))
      expect(result.message).toBeLessThanOrEqual(Math.max(0, messageCount - 1))
      expect(result.question).toBeLessThanOrEqual(
        Math.max(0, questionCount - 1)
      )
    }
  })
})

describe("isBatchesComplete", () => {
  it.each([
    [0, 1, true],
    [3, 4, true],
    [4, 4, true],
    [2, 4, false],
    [0, 0, true],
  ])("cursor.batch=%i, batchCount=%i -> %s", (batch, batchCount, expected) => {
    expect(
      isBatchesComplete({ batch, message: 0, question: 0 }, batchCount)
    ).toBe(expected)
  })
})

describe("createActiveState", () => {
  it("defaults to chat mode, running, question stage, score 0, and a zeroed cursor", () => {
    expect(createActiveState()).toEqual({
      mode: "chat",
      playState: "running",
      quizStage: "question",
      cursor: { batch: 0, message: 0, question: 0 },
      score: 0,
      timeRemaining: 180,
    })
  })

  it("accepts a custom starting cursor", () => {
    const cursor = { batch: 2, message: 0, question: 0 }
    expect(createActiveState(cursor).cursor).toBe(cursor)
  })
})

describe("V2: reducer purity", () => {
  it("does not mutate the input state and returns a distinct object on a real transition", () => {
    const state = createInitialState()
    const { state: newState } = sessionReducer(state, select("test"))

    expect(state).not.toBe(newState)
    expect(state.phase).toBe("selecting")
    expect(newState.phase).toBe("hydrating")
  })

  it("is deterministic: the same (state, event) pair always yields an equal result", () => {
    const state = createInitialState()
    const event = select("test")

    expect(sessionReducer(state, event)).toEqual(sessionReducer(state, event))
    expect(state).toEqual(createInitialState())
  })

  it("emits no effects for a no-op transition", () => {
    const { effects } = sessionReducer(createInitialState(), {
      type: "START_CHAT",
    })
    expect(effects).toEqual([])
  })
})

describe("V3 / V11: explicit transitions only, illegal transitions no-op", () => {
  it.each<[string, () => SessionState, SessionEvent]>([
    [
      "an event that doesn't apply to the current phase",
      createInitialState,
      { type: "START_CHAT" },
    ],
    [
      "ANSWER_SUBMITTED while in chat mode",
      (): SessionState => hydrate(),
      ANSWER_OK,
    ],
    [
      "BATCH_PASSED unless quizStage is summary",
      (): SessionState => fold(hydrate(), START_QUIZ),
      { type: "BATCH_PASSED" },
    ],
    [
      "an unrecognized phase/event combination",
      (): SessionState => ({
        ...createInitialState(),
        phase: "complete",
        active: null,
      }),
      { type: "TIMER_TICK" },
    ],
  ])("returns the same state reference for %s", (_, make, event) => {
    const state = make()
    expect(sessionReducer(state, event).state).toBe(state)
  })
})

describe("V5 / V6: epoch tracking", () => {
  it("increments hydrationEpoch exactly once per SELECT_TOPIK", () => {
    let state = createInitialState()
    expect(state.hydrationEpoch).toBe(0)
    state = fold(state, select("t1"))
    expect(state.hydrationEpoch).toBe(1)
    state = fold(state, CHANGE, select("t2"))
    expect(state.hydrationEpoch).toBe(2)
  })

  it("increments sessionEpoch on every successful hydration and on CHANGE_TOPIK", () => {
    expect(createInitialState().sessionEpoch).toBe(0)
    const state = hydrate([makeBatch(0, 1, 1)])
    expect(state.sessionEpoch).toBe(1)
    expect(fold(state, CHANGE).sessionEpoch).toBe(2)
  })

  it("V6 (reducer-level): a JSON round-tripped snapshot continues identically to the live state", () => {
    const state = fold(hydrate(), ADVANCE_M)
    // A remount recreates the machine from a plain-JSON snapshot
    // (createSessionMachine(initialState) in session-machine.ts).
    const restored = structuredClone(state)

    expect(fold(restored, ADVANCE_M)).toEqual(fold(state, ADVANCE_M))
  })
})

describe("V7: batches are only cleared by an explicit CHANGE_TOPIK", () => {
  it("leaves batches and topikKey untouched across unrelated events", () => {
    const before = hydrate()
    const state = fold(before, { type: "TIMER_TICK" }, PAUSE, {
      type: "RESUME_CHAT",
    })

    expect(state.dataRef.batches).toBe(before.dataRef.batches)
    expect(state.dataRef.topikKey).toBe(before.dataRef.topikKey)
  })

  it("CHANGE_TOPIK explicitly clears batches, topikKey, and status", () => {
    const state = fold(hydrate(), CHANGE)

    expect(state.dataRef.batches).toBeNull()
    expect(state.dataRef.topikKey).toBeNull()
    expect(state.dataRef.status).toBe("empty")
  })
})

describe("V8: stale-response rejection", () => {
  it.each<SessionEvent>([
    {
      type: "HYDRATION_SUCCESS",
      key: "topik-01",
      batches: [makeBatch(0, 1, 1)],
    },
    { type: "HYDRATION_FAILURE", key: "topik-01", error: "stale failure" },
  ])(
    "ignores a stale $type for a topik that is no longer selected",
    (event) => {
      const state = fold(
        createInitialState(),
        select("topik-01"),
        CHANGE,
        select("topik-02")
      )
      const { state: after } = sessionReducer(state, event)

      expect(after).toBe(state)
      expect(after.dataRef.topikKey).toBe("topik-02")
      expect(after.phase).toBe("hydrating")
    }
  )

  it("accepts a HYDRATION_SUCCESS whose key matches the currently selected topik", () => {
    const batches = [makeBatch(0, 4, 2)]
    const after = fold(createInitialState(), select("topik-01"), {
      type: "HYDRATION_SUCCESS",
      key: "topik-01",
      batches,
    })

    expect(after.phase).toBe("active")
    expect(after.dataRef.batches).toBe(batches)
    expect(after.dataRef.topikKey).toBe("topik-01")
  })
})

describe("V9: idempotent duplicate events", () => {
  it.each<
    [
      string,
      (s: SessionState) => SessionState,
      "running" | "paused",
      SessionEvent,
    ]
  >([
    [
      "START_CHAT is a no-op if already running",
      (s): SessionState => s,
      "running",
      { type: "START_CHAT" },
    ],
    [
      "PAUSE_CHAT is a no-op if already paused",
      (s): SessionState => fold(s, PAUSE),
      "paused",
      PAUSE,
    ],
    [
      "RESUME_CHAT is a no-op if already running",
      (s): SessionState => s,
      "running",
      { type: "RESUME_CHAT" },
    ],
    [
      "TIMER_TICK is a no-op once timeRemaining has reached 0",
      (s): SessionState => ({
        ...s,
        active: { ...s.active!, timeRemaining: 0 },
      }),
      "running",
      { type: "TIMER_TICK" },
    ],
  ])("%s", (_, prepare, playState, event) => {
    const state = prepare(hydrate())
    expect(state.active?.playState).toBe(playState)
    expect(sessionReducer(state, event).state).toBe(state)
  })
})

describe("V17: forward progress", () => {
  it.each([
    ["ADVANCE_MESSAGE", [], ADVANCE_M, "message"],
    ["ADVANCE_QUESTION", [START_QUIZ, ANSWER_OK], ADVANCE_Q, "question"],
  ] as const)(
    "%s never moves the cursor backward or holds it in place",
    (_, setup, event, field) => {
      const state = fold(hydrate(), ...setup)
      const before = state.active!.cursor[field]
      expect(fold(state, event).active!.cursor[field]).toBeGreaterThan(before)
    }
  )
})

describe("V18: complete phase only accepts CHANGE_TOPIK", () => {
  // The last batch's BATCH_PASSED -> complete.
  const completeSession = (): SessionState =>
    fold(hydrate([makeBatch(0, 1, 1)]), ...TO_SUMMARY, { type: "BATCH_PASSED" })

  it("reaches the complete phase with active cleared", () => {
    const state = completeSession()
    expect(state.phase).toBe("complete")
    expect(state.active).toBeNull()
  })

  it.each([
    { type: "START_CHAT" as const },
    { type: "TIMER_TICK" as const },
    { type: "ADVANCE_MESSAGE" as const },
    { type: "RESET_SESSION" as const },
  ])("ignores $type while complete", (event) => {
    const state = completeSession()
    expect(sessionReducer(state, event).state).toBe(state)
  })

  it("CHANGE_TOPIK is still allowed from the complete phase and returns to selecting", () => {
    const after = fold(completeSession(), CHANGE)
    expect(after.phase).toBe("selecting")
    expect(after.dataRef.topikKey).toBeNull()
  })
})

describe("V20: failures surface their error rather than disappearing silently", () => {
  it("CATALOG_FAILURE preserves the error message", () => {
    const state = fold(createInitialState(), {
      type: "CATALOG_FAILURE",
      error: "network down",
    })
    expect(state.dataRef.catalog.status).toBe("failed")
    expect(state.dataRef.catalog.error).toBe("network down")
  })

  it("HYDRATION_FAILURE (matching key) preserves the error and returns to selecting", () => {
    const after = fold(createInitialState(), select("t1"), {
      type: "HYDRATION_FAILURE",
      key: "t1",
      error: "fetch failed",
    })

    expect(after.phase).toBe("selecting")
    expect(after.dataRef.error).toBe("fetch failed")
    expect(after.dataRef.status).toBe("failed")
  })

  it("BATCH_FAILED preserves score while resetting the current batch's cursor", () => {
    const answered = fold(hydrate([makeBatch(0, 1, 1)]), START_QUIZ, ANSWER_OK)
    expect(answered.active?.score).toBe(1)

    const after = fold(answered, ADVANCE_Q, { type: "BATCH_FAILED" })

    expect(after.active?.score).toBe(0)
    expect(after.active?.cursor).toEqual({ batch: 0, message: 0, question: 0 })
  })
})

describe("V1 / V12 / V13: metadata tracking is independent of payload size", () => {
  it("currentBatchMeta only ever holds counts, never message/question content", () => {
    expect(hydrate([makeBatch(0, 200, 50)]).dataRef.currentBatchMeta).toEqual({
      id: 0,
      messageCount: 200,
      questionCount: 50,
    })
  })

  it("currentBatchMeta is null when the hydrated topik has no batches", () => {
    const state = hydrate([])
    expect(state.dataRef.currentBatchMeta).toBeNull()
    expect(state.dataRef.batchCount).toBe(0)
  })
})

describe("catalog request/loading/success/failure lifecycle", () => {
  const REQUEST: SessionEvent = { type: "REQUEST_CATALOG" }

  it("REQUEST_CATALOG transitions idle -> loading and emits TRIGGER_CATALOG_QUERY", () => {
    const { state, effects } = sessionReducer(createInitialState(), REQUEST)
    expect(state.dataRef.catalog.status).toBe("loading")
    expect(effects).toEqual([{ type: "TRIGGER_CATALOG_QUERY" }])
  })

  it("REQUEST_CATALOG is a no-op while already loading or ready", () => {
    const loading = fold(createInitialState(), REQUEST)
    expect(sessionReducer(loading, REQUEST).state).toBe(loading)

    const ready = fold(loading, { type: "CATALOG_SUCCESS", data: [] })
    expect(sessionReducer(ready, REQUEST).state).toBe(ready)
  })

  it("CATALOG_SUCCESS stores the data and is idempotent once ready", () => {
    const data = [
      {
        key: "t1",
        displayName: "Topik 1",
        description: "d",
        batchCount: 1,
        totalQuestions: 1,
        totalMessages: 1,
      },
    ]
    const event: SessionEvent = { type: "CATALOG_SUCCESS", data }
    const state = fold(createInitialState(), event)
    expect(state.dataRef.catalog).toEqual({
      status: "ready",
      data,
      error: null,
    })
    expect(sessionReducer(state, event).state).toBe(state)
  })

  it("catalog state is orthogonal to phase - surviving a topik selection", () => {
    const state = fold(
      createInitialState(),
      { type: "CATALOG_SUCCESS", data: [] },
      select("t1")
    )

    expect(state.dataRef.catalog.status).toBe("ready")
    expect(state.phase).toBe("hydrating")
  })
})

describe("chat/quiz/batch flow", () => {
  it("ADVANCE_MESSAGE past the last message transitions chat -> quiz", () => {
    const after = fold(hydrate([makeBatch(0, 1, 2)]), ADVANCE_M)

    expect(after.active?.mode).toBe("quiz")
    expect(after.active?.cursor.question).toBe(0)
  })

  it("ANSWER_SUBMITTED records feedback and increments score only when correct", () => {
    const state = fold(hydrate([makeBatch(0, 1, 2)]), START_QUIZ)

    const correct = fold(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
      userAnswer: "a",
    })
    expect(correct.active?.score).toBe(1)
    expect(correct.active?.quizStage).toBe("feedback")
    expect(correct.feedback?.isCorrect).toBe(true)

    const incorrect = fold(state, {
      type: "ANSWER_SUBMITTED",
      correct: false,
      userAnswer: "b",
    })
    expect(incorrect.active?.score).toBe(0)
    expect(incorrect.feedback?.isCorrect).toBe(false)
  })

  it("ADVANCE_QUESTION past the last question transitions to summary", () => {
    const after = fold(hydrate([makeBatch(0, 1, 1)]), ...TO_SUMMARY)
    expect(after.active?.quizStage).toBe("summary")
    expect(after.feedback).toBeNull()
  })

  it("BATCH_PASSED on a non-final batch advances to the next batch and resets progress", () => {
    const state = fold(
      hydrate([makeBatch(0, 1, 1), makeBatch(1, 1, 1)]),
      ...TO_SUMMARY
    )

    const { state: after, effects } = sessionReducer(state, {
      type: "BATCH_PASSED",
    })

    expect(after.active?.cursor).toEqual({ batch: 1, message: 0, question: 0 })
    expect(after.active?.mode).toBe("chat")
    expect(after.active?.score).toBe(0)
    expect(effects).toEqual([
      { type: "NOTIFY_BATCH_COMPLETE", batchIndex: 0 },
      { type: "PLAY_AUDIO" },
      { type: "START_TIMER" },
    ])
  })

  it("RESET_SESSION returns to selecting while preserving the loaded topik/data", () => {
    const { state: after, effects } = sessionReducer(
      hydrate([makeBatch(0, 1, 1)]),
      { type: "RESET_SESSION" }
    )

    expect(after.phase).toBe("selecting")
    expect(after.active).toBeNull()
    expect(after.feedback).toBeNull()
    expect(after.dataRef.topikKey).toBe("t1")
    expect(effects).toEqual([{ type: "STOP_TIMER" }, { type: "STOP_AUDIO" }])
  })

  it("JUMP_MESSAGE seeks to a clamped index without changing mode", () => {
    const after = fold(hydrate([makeBatch(0, 5, 1)]), {
      type: "JUMP_MESSAGE",
      index: 3,
    })
    expect(after.active?.cursor.message).toBe(3)
    expect(after.active?.mode).toBe("chat")
  })
})
