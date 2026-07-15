/**
 * session-reducer.test.ts
 *
 * Covers the invariants documented in ../README.md and in the header comment
 * of ./session-reducer.ts. Only V1, V2, V3, V5, V6, V7, V8, V9, V10, V11,
 * V12, V13, V17, V18, V20 have any grounding anywhere in this codebase (see
 * README.md's "Invariants Enforced" section and the V-number code comments
 * across core/*.ts). V4, V14, V15, V16, and V19 are named in the parent
 * issue but are not documented or referenced anywhere in source - rather
 * than invent meaning for them, this file covers every remaining reducer
 * branch (catalog lifecycle, quiz scoring/feedback, batch pass/fail, reset)
 * under plain behavioral `describe` blocks instead of a fabricated label.
 */
import type { ConversationBatch } from "@topik/lib/topik"
import type {
  BatchMetadata,
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

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

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

/** Drives the reducer through SELECT_TOPIK -> HYDRATION_SUCCESS into "active". */
function hydrate(
  state: SessionState,
  key: string,
  batches: Array<ConversationBatch>
): SessionState {
  ;({ state } = sessionReducer(state, { type: "SELECT_TOPIK", key }))
  ;({ state } = sessionReducer(state, {
    type: "HYDRATION_SUCCESS",
    key,
    batches,
  }))
  return state
}

// Deterministic PRNG (mulberry32) so the property-style test below is
// reproducible across runs without pulling in a new test dependency.
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

// ═══════════════════════════════════════════════════════════════════════════
// createInitialState
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Cursor utilities: validateCursor, isBatchesComplete, createActiveState
// ═══════════════════════════════════════════════════════════════════════════

describe("validateCursor (V10: cursor bounds safety)", () => {
  it("returns the cursor unchanged when no metadata is available", () => {
    const cursor = { batch: 99, message: 99, question: 99 }
    expect(validateCursor(cursor, null, 0)).toBe(cursor)
  })

  it("clamps each field to its upper bound", () => {
    const meta = makeMeta({ messageCount: 5, questionCount: 3 })
    expect(
      validateCursor({ batch: 10, message: 10, question: 10 }, meta, 4)
    ).toEqual({
      batch: 3,
      message: 4,
      question: 2,
    })
  })

  it("clamps negative values up to 0", () => {
    const meta = makeMeta()
    expect(
      validateCursor({ batch: -5, message: -1, question: -3 }, meta, 4)
    ).toEqual({ batch: 0, message: 0, question: 0 })
  })

  it("leaves an already-in-bounds cursor untouched", () => {
    const meta = makeMeta({ messageCount: 5, questionCount: 3 })
    expect(
      validateCursor({ batch: 1, message: 2, question: 1 }, meta, 4)
    ).toEqual({
      batch: 1,
      message: 2,
      question: 1,
    })
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

      // Math.min(cursor, bound - 1) with bound = 0 clamps to -1, then
      // Math.max(0, -1) floors it back to 0 - so an empty bound still
      // produces 0 rather than a negative index.
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

// ═══════════════════════════════════════════════════════════════════════════
// V2: Pure, deterministic, no side effects
// ═══════════════════════════════════════════════════════════════════════════

describe("V2: reducer purity", () => {
  it("does not mutate the input state and returns a distinct object on a real transition", () => {
    const state = createInitialState()
    const { state: newState } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "test",
    })

    expect(state).not.toBe(newState)
    expect(state.phase).toBe("selecting")
    expect(newState.phase).toBe("hydrating")
  })

  it("is deterministic: the same (state, event) pair always yields an equal result", () => {
    const state = createInitialState()
    const event = { type: "SELECT_TOPIK" as const, key: "test" }

    const first = sessionReducer(state, event)
    const second = sessionReducer(state, event)

    expect(first).toEqual(second)
    expect(state).toEqual(createInitialState()) // original input still untouched
  })

  it("emits no effects for a no-op transition", () => {
    const state = createInitialState()
    const { effects } = sessionReducer(state, { type: "START_CHAT" })
    expect(effects).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V3 / V11: Only explicitly-defined transitions change state
// ═══════════════════════════════════════════════════════════════════════════

describe("V3 / V11: explicit transitions only, illegal transitions no-op", () => {
  it("returns the exact same state reference for an event that doesn't apply to the current phase", () => {
    const state = createInitialState() // phase: selecting
    const { state: after } = sessionReducer(state, { type: "START_CHAT" })
    expect(after).toBe(state)
  })

  it("ignores ANSWER_SUBMITTED while in chat mode (not quiz mode)", () => {
    const active = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    const { state: after } = sessionReducer(active, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    })
    expect(after).toBe(active)
  })

  it("ignores BATCH_PASSED unless quizStage is summary", () => {
    const active = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    const { state } = sessionReducer(active, { type: "START_QUIZ" }) // quizStage: question
    const { state: after } = sessionReducer(state, { type: "BATCH_PASSED" })
    expect(after).toBe(state)
  })

  it("falls through to unchanged() for a totally unrecognized phase/event combination", () => {
    const complete: SessionState = {
      ...createInitialState(),
      phase: "complete",
      active: null,
    }
    const { state: after } = sessionReducer(complete, { type: "TIMER_TICK" })
    expect(after).toBe(complete)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V5 / V6: Hydration epoch tracking backs idempotent load + remount stability
// ═══════════════════════════════════════════════════════════════════════════

describe("V5 / V6: epoch tracking", () => {
  it("increments hydrationEpoch exactly once per SELECT_TOPIK", () => {
    let state = createInitialState()
    expect(state.hydrationEpoch).toBe(0)
    ;({ state } = sessionReducer(state, { type: "SELECT_TOPIK", key: "t1" }))
    expect(state.hydrationEpoch).toBe(1)
    ;({ state } = sessionReducer(state, { type: "CHANGE_TOPIK" }))
    ;({ state } = sessionReducer(state, { type: "SELECT_TOPIK", key: "t2" }))
    expect(state.hydrationEpoch).toBe(2)
  })

  it("increments sessionEpoch on every successful hydration and on CHANGE_TOPIK", () => {
    let state = createInitialState()
    expect(state.sessionEpoch).toBe(0)

    state = hydrate(state, "t1", [makeBatch(0, 1, 1)])
    expect(state.sessionEpoch).toBe(1)
    ;({ state } = sessionReducer(state, { type: "CHANGE_TOPIK" }))
    expect(state.sessionEpoch).toBe(2)
  })

  it("V6 (reducer-level): a JSON round-tripped snapshot continues identically to the live state", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    ;({ state } = sessionReducer(state, { type: "ADVANCE_MESSAGE" }))

    // Simulates a remount: the machine is recreated from a persisted,
    // plain-JSON snapshot of the last known state (see
    // createSessionMachine(initialState) in session-machine.ts).
    const restored = structuredClone(state)

    const fromLive = sessionReducer(state, { type: "ADVANCE_MESSAGE" })
    const fromRestored = sessionReducer(restored, { type: "ADVANCE_MESSAGE" })

    expect(fromRestored.state).toEqual(fromLive.state)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V7: Invalidation / clearing of hydrated data is explicit only
// ═══════════════════════════════════════════════════════════════════════════

describe("V7: batches are only cleared by an explicit CHANGE_TOPIK", () => {
  it("leaves batches and topikKey untouched across unrelated events", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    const batchesBefore = state.dataRef.batches
    const keyBefore = state.dataRef.topikKey

    ;({ state } = sessionReducer(state, { type: "TIMER_TICK" }))
    ;({ state } = sessionReducer(state, { type: "PAUSE_CHAT" }))
    ;({ state } = sessionReducer(state, { type: "RESUME_CHAT" }))

    expect(state.dataRef.batches).toBe(batchesBefore)
    expect(state.dataRef.topikKey).toBe(keyBefore)
  })

  it("CHANGE_TOPIK explicitly clears batches, topikKey, and status", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    ;({ state } = sessionReducer(state, { type: "CHANGE_TOPIK" }))

    expect(state.dataRef.batches).toBeNull()
    expect(state.dataRef.topikKey).toBeNull()
    expect(state.dataRef.status).toBe("empty")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V8: Out-of-order (stale) hydration responses are rejected
// ═══════════════════════════════════════════════════════════════════════════

describe("V8: stale-response rejection", () => {
  it("ignores a stale HYDRATION_SUCCESS for a topik that is no longer selected", () => {
    let state = createInitialState()

    ;({ state } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "topik-01",
    }))
    ;({ state } = sessionReducer(state, { type: "CHANGE_TOPIK" }))
    ;({ state } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "topik-02",
    }))

    const { state: after } = sessionReducer(state, {
      type: "HYDRATION_SUCCESS",
      key: "topik-01",
      batches: [makeBatch(0, 1, 1)],
    })

    // Stale response ignored - state reference unchanged, still hydrating topik-02
    expect(after).toBe(state)
    expect(after.dataRef.topikKey).toBe("topik-02")
    expect(after.phase).toBe("hydrating")
  })

  it("accepts a HYDRATION_SUCCESS whose key matches the currently selected topik", () => {
    let state = createInitialState()
    ;({ state } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "topik-01",
    }))

    const batches = [makeBatch(0, 4, 2)]
    const { state: after } = sessionReducer(state, {
      type: "HYDRATION_SUCCESS",
      key: "topik-01",
      batches,
    })

    expect(after.phase).toBe("active")
    expect(after.dataRef.batches).toBe(batches)
    expect(after.dataRef.topikKey).toBe("topik-01")
  })

  it("also ignores a stale HYDRATION_FAILURE for a topik that is no longer selected", () => {
    let state = createInitialState()
    ;({ state } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "topik-01",
    }))
    ;({ state } = sessionReducer(state, { type: "CHANGE_TOPIK" }))
    ;({ state } = sessionReducer(state, {
      type: "SELECT_TOPIK",
      key: "topik-02",
    }))

    const { state: after } = sessionReducer(state, {
      type: "HYDRATION_FAILURE",
      key: "topik-01",
      error: "stale failure",
    })

    expect(after).toBe(state)
    expect(after.dataRef.topikKey).toBe("topik-02")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V9: Duplicate events are idempotent
// ═══════════════════════════════════════════════════════════════════════════

describe("V9: idempotent duplicate events", () => {
  it("START_CHAT is a no-op if already running", () => {
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    expect(state.active?.playState).toBe("running")

    const { state: after } = sessionReducer(state, { type: "START_CHAT" })
    expect(after).toBe(state)
  })

  it("PAUSE_CHAT is a no-op if already paused", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    ;({ state } = sessionReducer(state, { type: "PAUSE_CHAT" }))
    expect(state.active?.playState).toBe("paused")

    const { state: after } = sessionReducer(state, { type: "PAUSE_CHAT" })
    expect(after).toBe(state)
  })

  it("RESUME_CHAT is a no-op if already running", () => {
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    const { state: after } = sessionReducer(state, { type: "RESUME_CHAT" })
    expect(after).toBe(state)
  })

  it("TIMER_TICK is a no-op once timeRemaining has reached 0", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    state = { ...state, active: { ...state.active!, timeRemaining: 0 } }

    const { state: after } = sessionReducer(state, { type: "TIMER_TICK" })
    expect(after).toBe(state)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V17: Forward progress only
// ═══════════════════════════════════════════════════════════════════════════

describe("V17: forward progress", () => {
  it("ADVANCE_MESSAGE never moves the cursor backward or holds it in place", () => {
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    const before = state.active!.cursor.message

    const { state: after } = sessionReducer(state, { type: "ADVANCE_MESSAGE" })

    expect(after.active!.cursor.message).toBeGreaterThan(before)
  })

  it("ADVANCE_QUESTION never moves the cursor backward or holds it in place", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 3, 2)])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))
    ;({ state } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    }))
    const before = state.active!.cursor.question

    const { state: after } = sessionReducer(state, { type: "ADVANCE_QUESTION" })

    expect(after.active!.cursor.question).toBeGreaterThan(before)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V18: Terminal state stability
// ═══════════════════════════════════════════════════════════════════════════

describe("V18: complete phase only accepts CHANGE_TOPIK", () => {
  function completeSession(): SessionState {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 1)])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))
    ;({ state } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    }))
    ;({ state } = sessionReducer(state, { type: "ADVANCE_QUESTION" })) // -> summary
    ;({ state } = sessionReducer(state, { type: "BATCH_PASSED" })) // last batch -> complete
    return state
  }

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
    const { state: after } = sessionReducer(state, event)
    expect(after).toBe(state)
  })

  it("CHANGE_TOPIK is still allowed from the complete phase and returns to selecting", () => {
    const state = completeSession()
    const { state: after } = sessionReducer(state, { type: "CHANGE_TOPIK" })
    expect(after.phase).toBe("selecting")
    expect(after.dataRef.topikKey).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// V20: No silent data loss on failure paths
// ═══════════════════════════════════════════════════════════════════════════

describe("V20: failures surface their error rather than disappearing silently", () => {
  it("CATALOG_FAILURE preserves the error message", () => {
    const { state } = sessionReducer(createInitialState(), {
      type: "CATALOG_FAILURE",
      error: "network down",
    })
    expect(state.dataRef.catalog.status).toBe("failed")
    expect(state.dataRef.catalog.error).toBe("network down")
  })

  it("HYDRATION_FAILURE (matching key) preserves the error and returns to selecting", () => {
    let state = createInitialState()
    ;({ state } = sessionReducer(state, { type: "SELECT_TOPIK", key: "t1" }))

    const { state: after } = sessionReducer(state, {
      type: "HYDRATION_FAILURE",
      key: "t1",
      error: "fetch failed",
    })

    expect(after.phase).toBe("selecting")
    expect(after.dataRef.error).toBe("fetch failed")
    expect(after.dataRef.status).toBe("failed")
  })

  it("BATCH_FAILED preserves score while resetting the current batch's cursor", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 1)])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))
    ;({ state } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    }))
    expect(state.active?.score).toBe(1)
    ;({ state } = sessionReducer(state, { type: "ADVANCE_QUESTION" })) // -> summary

    const { state: after } = sessionReducer(state, { type: "BATCH_FAILED" })

    expect(after.active?.score).toBe(0)
    expect(after.active?.cursor).toEqual({ batch: 0, message: 0, question: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Memory & Scale (V1, V12, V13): metadata stays O(1) regardless of payload size
// ═══════════════════════════════════════════════════════════════════════════

describe("V1 / V12 / V13: metadata tracking is independent of payload size", () => {
  it("currentBatchMeta only ever holds counts, never message/question content", () => {
    const bigBatch = makeBatch(0, 200, 50)
    const state = hydrate(createInitialState(), "t1", [bigBatch])

    expect(state.dataRef.currentBatchMeta).toEqual({
      id: 0,
      messageCount: 200,
      questionCount: 50,
    })
  })

  it("currentBatchMeta is null when the hydrated topik has no batches", () => {
    const state = hydrate(createInitialState(), "t1", [])
    expect(state.dataRef.currentBatchMeta).toBeNull()
    expect(state.dataRef.batchCount).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Catalog lifecycle (orthogonal to phase) - not tied to a specific V-number
// ═══════════════════════════════════════════════════════════════════════════

describe("catalog request/loading/success/failure lifecycle", () => {
  it("REQUEST_CATALOG transitions idle -> loading and emits TRIGGER_CATALOG_QUERY", () => {
    const { state, effects } = sessionReducer(createInitialState(), {
      type: "REQUEST_CATALOG",
    })
    expect(state.dataRef.catalog.status).toBe("loading")
    expect(effects).toEqual([{ type: "TRIGGER_CATALOG_QUERY" }])
  })

  it("REQUEST_CATALOG is a no-op while already loading or ready", () => {
    let state = createInitialState()
    ;({ state } = sessionReducer(state, { type: "REQUEST_CATALOG" }))

    const { state: stillLoading } = sessionReducer(state, {
      type: "REQUEST_CATALOG",
    })
    expect(stillLoading).toBe(state)
    ;({ state } = sessionReducer(state, {
      type: "CATALOG_SUCCESS",
      data: [],
    }))
    const { state: stillReady } = sessionReducer(state, {
      type: "REQUEST_CATALOG",
    })
    expect(stillReady).toBe(state)
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
    let state = createInitialState()
    ;({ state } = sessionReducer(state, { type: "CATALOG_SUCCESS", data }))
    expect(state.dataRef.catalog).toEqual({
      status: "ready",
      data,
      error: null,
    })

    const { state: after } = sessionReducer(state, {
      type: "CATALOG_SUCCESS",
      data,
    })
    expect(after).toBe(state)
  })

  it("catalog state is orthogonal to phase - surviving a topik selection", () => {
    let state = createInitialState()
    ;({ state } = sessionReducer(state, { type: "CATALOG_SUCCESS", data: [] }))
    ;({ state } = sessionReducer(state, { type: "SELECT_TOPIK", key: "t1" }))

    expect(state.dataRef.catalog.status).toBe("ready")
    expect(state.phase).toBe("hydrating")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Chat -> quiz -> batch-summary flow (full happy path, not tied to one V-number)
// ═══════════════════════════════════════════════════════════════════════════

describe("chat/quiz/batch flow", () => {
  it("ADVANCE_MESSAGE past the last message transitions chat -> quiz", () => {
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 2)])
    const { state: after } = sessionReducer(state, { type: "ADVANCE_MESSAGE" })

    expect(after.active?.mode).toBe("quiz")
    expect(after.active?.cursor.question).toBe(0)
  })

  it("ANSWER_SUBMITTED records feedback and increments score only when correct", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 2)])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))

    const { state: correct } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
      userAnswer: "a",
    })
    expect(correct.active?.score).toBe(1)
    expect(correct.active?.quizStage).toBe("feedback")
    expect(correct.feedback?.isCorrect).toBe(true)

    const { state: incorrect } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: false,
      userAnswer: "b",
    })
    expect(incorrect.active?.score).toBe(0)
    expect(incorrect.feedback?.isCorrect).toBe(false)
  })

  it("ADVANCE_QUESTION past the last question transitions to summary", () => {
    let state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 1)])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))
    ;({ state } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    }))

    const { state: after } = sessionReducer(state, {
      type: "ADVANCE_QUESTION",
    })
    expect(after.active?.quizStage).toBe("summary")
    expect(after.feedback).toBeNull()
  })

  it("BATCH_PASSED on a non-final batch advances to the next batch and resets progress", () => {
    let state = hydrate(createInitialState(), "t1", [
      makeBatch(0, 1, 1),
      makeBatch(1, 1, 1),
    ])
    ;({ state } = sessionReducer(state, { type: "START_QUIZ" }))
    ;({ state } = sessionReducer(state, {
      type: "ANSWER_SUBMITTED",
      correct: true,
    }))
    ;({ state } = sessionReducer(state, { type: "ADVANCE_QUESTION" })) // -> summary

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
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 1, 1)])
    const { state: after, effects } = sessionReducer(state, {
      type: "RESET_SESSION",
    })

    expect(after.phase).toBe("selecting")
    expect(after.active).toBeNull()
    expect(after.feedback).toBeNull()
    expect(after.dataRef.topikKey).toBe("t1") // data untouched, only session progress resets
    expect(effects).toEqual([{ type: "STOP_TIMER" }, { type: "STOP_AUDIO" }])
  })

  it("JUMP_MESSAGE seeks to a clamped index without changing mode", () => {
    const state = hydrate(createInitialState(), "t1", [makeBatch(0, 5, 1)])
    const { state: after } = sessionReducer(state, {
      type: "JUMP_MESSAGE",
      index: 3,
    })
    expect(after.active?.cursor.message).toBe(3)
    expect(after.active?.mode).toBe("chat")
  })
})
