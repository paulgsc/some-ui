/**
 * Session Reducer - Pure State Transitions
 *
 * INVARIANTS ENFORCED:
 * - V2: Pure, deterministic, no side effects
 * - V3: Explicit transitions only
 * - V10: Cursor bounds safety
 * - V11: No illegal transitions
 * - V17: Forward progress
 * - V18: Terminal stability
 * - V20: No silent data loss
 */

import type {
  ActiveSessionState,
  BatchMetadata,
  ReducerResult,
  SessionCursor,
  SessionEffect,
  SessionEvent,
  SessionState,
} from "./session-types"

// ═══════════════════════════════════════════════════════════════════════════
// INITIAL STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createInitialState(): SessionState {
  return {
    phase: "selecting",
    dataRef: {
      catalog: {
        status: "idle",
        data: null,
        error: null,
      },
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
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CURSOR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create initial cursor for new batch
 */
function createInitialCursor(): SessionCursor {
  return { batch: 0, message: 0, question: 0 }
}

/**
 * Validate and clamp cursor bounds (V10)
 */
function validateCursor(
  cursor: SessionCursor,
  meta: BatchMetadata | null,
  batchCount: number
): SessionCursor {
  if (!meta) return cursor

  return {
    batch: Math.max(0, Math.min(cursor.batch, batchCount - 1)),
    message: Math.max(0, Math.min(cursor.message, meta.messageCount - 1)),
    question: Math.max(0, Math.min(cursor.question, meta.questionCount - 1)),
  }
}

/**

/**
 * Check if cursor is at end of questions
 */
function isQuestionsComplete(
  cursor: SessionCursor,
  meta: BatchMetadata | null
): boolean {
  if (!meta) return false
  return cursor.question >= meta.questionCount
}

/**
 * Check if all batches complete
 */
function isBatchesComplete(cursor: SessionCursor, batchCount: number): boolean {
  return cursor.batch >= batchCount - 1
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

function createActiveState(
  cursor: SessionCursor = createInitialCursor()
): ActiveSessionState {
  return {
    mode: "chat",
    playState: "running",
    quizStage: "question",
    cursor,
    score: 0,
    timeRemaining: 180,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pure reducer - returns new state + effects
 *
 * V2: No I/O, no mutations, deterministic
 * V3: All transitions explicit
 */
export function sessionReducer(
  state: SessionState,
  event: SessionEvent
): ReducerResult {
  // Default: no state change, no effects
  const unchanged = (): ReducerResult => ({ state, effects: [] })

  // Helper: return new state with effects
  const result = (
    newState: SessionState,
    effects: ReducerResult["effects"] = []
  ): ReducerResult => ({ state: newState, effects })

  // ═══════════════════════════════════════════════════════════════════════
  // CATALOG REQUEST
  // ═══════════════════════════════════════════════════════════════════════

  if (event.type === "REQUEST_CATALOG") {
    // Only trigger if not already loading or ready
    if (
      state.dataRef.catalog.status === "loading" ||
      state.dataRef.catalog.status === "ready"
    ) {
      return unchanged()
    }

    return result(
      {
        ...state,
        dataRef: {
          ...state.dataRef,
          catalog: {
            status: "loading",
            data: null,
            error: null,
          },
        },
      },
      [{ type: "TRIGGER_CATALOG_QUERY" }]
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CATALOG STATE TRANSITIONS (orthogonal to phase)
  // ═══════════════════════════════════════════════════════════════════════

  // Catalog loading started
  if (event.type === "CATALOG_LOADING") {
    if (state.dataRef.catalog.status === "loading") return unchanged()

    return result({
      ...state,
      dataRef: {
        ...state.dataRef,
        catalog: {
          status: "loading",
          data: null,
          error: null,
        },
      },
    })
  }

  // Catalog loaded successfully
  if (event.type === "CATALOG_SUCCESS") {
    if (state.dataRef.catalog.status === "ready") return unchanged()

    return result({
      ...state,
      dataRef: {
        ...state.dataRef,
        catalog: {
          status: "ready",
          data: event.data,
          error: null,
        },
      },
    })
  }

  // Catalog load failed
  if (event.type === "CATALOG_FAILURE") {
    return result({
      ...state,
      dataRef: {
        ...state.dataRef,
        catalog: {
          status: "failed",
          data: null,
          error: event.error,
        },
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE: SELECTING
  // ═══════════════════════════════════════════════════════════════════════

  if (state.phase === "selecting") {
    if (event.type === "SELECT_TOPIK") {
      return result(
        {
          ...state,
          phase: "hydrating",
          dataRef: {
            ...state.dataRef,
            topikKey: event.key,
            batches: null,
            status: "loading",
            error: null,
            batchCount: 0,
            currentBatchMeta: null,
          },
          hydrationEpoch: state.hydrationEpoch + 1,
        },
        [{ type: "TRIGGER_TOPIK_QUERY", key: event.key }]
      )
    }

    return unchanged()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE: HYDRATING
  // ═══════════════════════════════════════════════════════════════════════

  if (state.phase === "hydrating") {
    // Race protection (V8): only accept response for current key
    if (event.type === "HYDRATION_SUCCESS") {
      return result(
        {
          ...state,
          phase: "active",
          dataRef: {
            ...state.dataRef,
            status: "ready",
            batches: event.batches,
            batchCount: event.batches.length,
            currentBatchMeta: event.batches[0]
              ? {
                  id: event.batches[0].id,
                  messageCount: event.batches[0].messages.length,
                  questionCount: event.batches[0].questions.length,
                }
              : null,
          },
          active: createActiveState(),
          sessionEpoch: state.sessionEpoch + 1,
        },
        [
          { type: "START_TIMER" },
          {
            type: "PLAY_AUDIO",
          },
        ]
      )
    }

    if (
      event.type === "HYDRATION_FAILURE" &&
      event.key === state.dataRef.topikKey
    ) {
      return result({
        ...state,
        phase: "selecting",
        dataRef: {
          ...state.dataRef,
          topikKey: null,
          batches: null,
          status: "failed",
          error: event.error,
          batchCount: 0,
          currentBatchMeta: null,
        },
      })
    }

    // Allow topik change during loading
    if (event.type === "CHANGE_TOPIK") {
      return result({
        ...createInitialState(),
        dataRef: {
          ...state.dataRef,
          catalog: state.dataRef.catalog, // Preserve catalog state
          topikKey: null,
          status: "empty",
          error: null,
          batchCount: 0,
          currentBatchMeta: null,
        },
        hydrationEpoch: state.hydrationEpoch,
        sessionEpoch: state.sessionEpoch + 1,
      })
    }

    return unchanged()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE: ACTIVE
  // ═══════════════════════════════════════════════════════════════════════

  if (state.phase === "active" && state.active) {
    const { active, dataRef } = state

    // CHANGE_TOPIK: Return to selection
    if (event.type === "CHANGE_TOPIK") {
      return result(
        {
          ...createInitialState(),
          hydrationEpoch: state.hydrationEpoch,
          sessionEpoch: state.sessionEpoch + 1,
        },
        [{ type: "STOP_TIMER" }, { type: "STOP_AUDIO" }]
      )
    }

    // RESET_SESSION: Back to selection with same topik
    if (event.type === "RESET_SESSION") {
      return result(
        {
          ...state,
          phase: "selecting",
          active: null,
          feedback: null,
        },
        [{ type: "STOP_TIMER" }, { type: "STOP_AUDIO" }]
      )
    }

    // ─────────────────────────────────────────────────────────────────────
    // CHAT MODE
    // ─────────────────────────────────────────────────────────────────────

    if (active.mode === "chat") {
      // START_CHAT: Idempotent (V9)
      if (event.type === "START_CHAT") {
        if (active.playState === "running") return unchanged()

        // Start timer and play current message
        return result(
          {
            ...state,
            active: { ...active, playState: "running" },
          },
          [
            { type: "START_TIMER" },
            {
              type: "PLAY_AUDIO",
            },
          ]
        )
      }

      // PAUSE_CHAT
      if (event.type === "PAUSE_CHAT") {
        if (active.playState === "paused") return unchanged()

        return result(
          {
            ...state,
            active: { ...active, playState: "paused" },
          },
          [{ type: "STOP_TIMER" }, { type: "STOP_AUDIO" }]
        )
      }

      // RESUME_CHAT
      if (event.type === "RESUME_CHAT") {
        if (active.playState === "running") return unchanged()

        // Resume timer and play current message
        return result(
          {
            ...state,
            active: { ...active, playState: "running" },
          },
          [
            { type: "START_TIMER" },
            {
              type: "PLAY_AUDIO",
            },
          ]
        )
      }

      // ADVANCE_MESSAGE
      if (event.type === "ADVANCE_MESSAGE") {
        const nextMessage = active.cursor.message + 1
        const validated = validateCursor(
          { ...active.cursor, message: nextMessage },
          dataRef.currentBatchMeta,
          dataRef.batchCount
        )

        // Check if messages complete -> transition to quiz
        if (nextMessage >= dataRef.currentBatchMeta!.messageCount) {
          return result(
            {
              ...state,
              active: {
                ...active,
                mode: "quiz",
                cursor: { ...validated, question: 0 },
              },
            },
            [{ type: "STOP_AUDIO" }]
          )
        }

        // V17: Forward progress only
        if (validated.message <= active.cursor.message) return unchanged()

        // Auto-play next message if running
        const effects: Array<SessionEffect> = []
        if (active.playState === "running") {
          // Emit PLAY_AUDIO effect for new message
          // messageId will be retrieved by executor from repository
          effects.push({
            type: "PLAY_AUDIO",
          })
        }

        return result(
          {
            ...state,
            active: { ...active, cursor: validated },
          },
          effects
        )
      }

      // JUMP_MESSAGE: Allow seeking during pause or review
      if (event.type === "JUMP_MESSAGE") {
        const validated = validateCursor(
          { ...active.cursor, message: event.index },
          dataRef.currentBatchMeta,
          dataRef.batchCount
        )

        return result({
          ...state,
          active: { ...active, cursor: validated },
        })
      }

      // TIMER_TICK
      if (event.type === "TIMER_TICK" && active.playState === "running") {
        if (active.timeRemaining <= 0) return unchanged()

        return result({
          ...state,
          active: {
            ...active,
            timeRemaining: active.timeRemaining - 1,
          },
        })
      }

      // START_QUIZ: Manual transition to quiz
      if (event.type === "START_QUIZ") {
        return result({
          ...state,
          active: {
            ...active,
            mode: "quiz",
            quizStage: "question",
            cursor: { ...active.cursor, question: 0 },
          },
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // QUIZ MODE
    // ─────────────────────────────────────────────────────────────────────

    if (active.mode === "quiz") {
      // ANSWER_SUBMITTED
      if (
        event.type === "ANSWER_SUBMITTED" &&
        active.quizStage === "question"
      ) {
        return result({
          ...state,
          active: {
            ...active,
            quizStage: "feedback",
            score: event.correct ? active.score + 1 : active.score,
          },
          feedback: {
            isCorrect: event.correct,
            questionType: "multiple-choice", // Retrieved from repository
            userAnswer: event.userAnswer,
            correctAnswer: "", // Retrieved from repository
            explanation: "", // Retrieved from repository
            grammarNote: undefined,
          },
        })
      }

      // DISMISS_FEEDBACK / ADVANCE_QUESTION
      if (
        (event.type === "DISMISS_FEEDBACK" ||
          event.type === "ADVANCE_QUESTION") &&
        active.quizStage === "feedback"
      ) {
        const nextQuestion = active.cursor.question + 1
        const validated = validateCursor(
          { ...active.cursor, question: nextQuestion },
          dataRef.currentBatchMeta,
          dataRef.batchCount
        )

        // All questions complete -> show summary
        if (isQuestionsComplete(validated, dataRef.currentBatchMeta)) {
          return result({
            ...state,
            active: { ...active, quizStage: "summary", cursor: validated },
            feedback: null,
          })
        }

        // V17: Forward progress
        if (validated.question <= active.cursor.question) return unchanged()

        return result({
          ...state,
          active: {
            ...active,
            quizStage: "question",
            cursor: validated,
          },
          feedback: null,
        })
      }

      // BATCH_PASSED: From summary
      if (event.type === "BATCH_PASSED" && active.quizStage === "summary") {
        const nextBatch = active.cursor.batch + 1

        // All batches complete -> session complete
        if (isBatchesComplete(active.cursor, dataRef.batchCount)) {
          return result(
            {
              ...state,
              phase: "complete",
              active: null,
            },
            [{ type: "STOP_TIMER" }, { type: "NOTIFY_SESSION_COMPLETE" }]
          )
        }

        // Advance to next batch
        return result(
          {
            ...state,
            active: createActiveState({
              batch: nextBatch,
              message: 0,
              question: 0,
            }),
            feedback: null,
          },
          [{ type: "NOTIFY_BATCH_COMPLETE", batchIndex: active.cursor.batch }]
        )
      }

      // BATCH_FAILED: Retry current batch
      if (event.type === "BATCH_FAILED" && active.quizStage === "summary") {
        return result({
          ...state,
          active: createActiveState({
            batch: active.cursor.batch,
            message: 0,
            question: 0,
          }),
          feedback: null,
        })
      }
    }

    return unchanged()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE: COMPLETE
  // ═══════════════════════════════════════════════════════════════════════

  if (state.phase === "complete") {
    // V18: Terminal state - only CHANGE_TOPIK allowed
    if (event.type === "CHANGE_TOPIK") {
      return result({
        ...createInitialState(),
        dataRef: {
          ...state.dataRef,
          topikKey: null,
          status: "empty",
          error: null,
          batchCount: 0,
          currentBatchMeta: null,
        },
        hydrationEpoch: state.hydrationEpoch,
        sessionEpoch: state.sessionEpoch + 1,
      })
    }

    return unchanged()
  }

  // V11: No illegal transitions
  return unchanged()
}
