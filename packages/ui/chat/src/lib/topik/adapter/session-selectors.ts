/**
 * Session Selectors - Read from FSM State Only
 *
 * Model 1: All data flows through FSM, not query cache
 * These selectors operate on SessionState, not QueryClient
 * Session Selectors - Pure functions over SessionState
 *
 * Invariant: No IO, no cache reads, no side effects
 */
import type {
  BatchMetadata,
  CatalogStatus,
  ConversationBatch,
  FeedbackData,
  Message,
  Question,
  QuizStage,
  SessionCursor,
  SessionEvent,
  SessionState,
  TopikMetadata,
} from "@chat/lib/topik"

// ═══════════════════════════════════════════════════════════════════════════
// SELECTORS - FSM STATE
// ═══════════════════════════════════════════════════════════════════════════

export const selectors = {
  /**
   * Get current phase
   */
  getPhase(state: SessionState): SessionState["phase"] {
    return state.phase
  },

  /**
   * Get catalog status
   */
  getCatalogStatus(state: SessionState): CatalogStatus {
    return state.dataRef.catalog.status
  },

  /**
   * Get catalog error
   */
  getCatalogError(state: SessionState): string | null {
    return state.dataRef.catalog.error
  },

  /**
   * Check if catalog is loading
   */
  isCatalogLoading(state: SessionState): boolean {
    return state.dataRef.catalog.status === "loading"
  },

  /**
   * Check if catalog is ready
   */
  isCatalogReady(state: SessionState): boolean {
    return state.dataRef.catalog.status === "ready"
  },

  /**
   * Check if in selection phase
   */
  isSelecting(state: SessionState): boolean {
    return state.phase === "selecting"
  },

  /**
   * Get current topik key
   */
  getTopikKey(state: SessionState): string | null {
    return state.dataRef.topikKey
  },

  /**
   * Check if session is loading (hydrating topik)
   */
  isLoading(state: SessionState): boolean {
    return state.phase === "hydrating"
  },

  /**
   * Check if session is active
   */
  isActive(state: SessionState): boolean {
    return state.phase === "active" && state.active !== null
  },

  /**
   * Check if in chat mode
   */
  isInChat(state: SessionState): boolean {
    return state.active?.mode === "chat"
  },

  /**
   * Check if in quiz mode
   */
  isInQuiz(state: SessionState): boolean {
    return state.active?.mode === "quiz"
  },

  /**
   * Check if chat is playing
   */
  isChatPlaying(state: SessionState): boolean {
    return state.active?.mode === "chat" && state.active.playState === "running"
  },

  /**
   * Check if chat is paused
   */
  isChatPaused(state: SessionState): boolean {
    return state.active?.mode === "chat" && state.active.playState === "paused"
  },

  /**
   * Get current cursor
   */
  getCursor(state: SessionState): SessionCursor | null {
    return state.active?.cursor ?? null
  },

  /**
   * Get current batch index
   */
  getBatchIndex(state: SessionState): number {
    return state.active?.cursor.batch ?? 0
  },

  /**
   * Get current message index
   */
  getMessageIndex(state: SessionState): number {
    return state.active?.cursor.message ?? 0
  },

  /**
   * Get current question index
   */
  getQuestionIndex(state: SessionState): number {
    return state.active?.cursor.question ?? 0
  },

  /**
   * Get score
   */
  getScore(state: SessionState): number {
    return state.active?.score ?? 0
  },

  /**
   * Get time remaining
   */
  getTimeRemaining(state: SessionState): number {
    return state.active?.timeRemaining ?? 0
  },

  /**
   * Get quiz stage
   */
  getQuizStage(state: SessionState): QuizStage | null {
    return state.active?.mode === "quiz" ? state.active.quizStage : null
  },

  /**
   * Get feedback data
   */
  getFeedback(state: SessionState): FeedbackData | null {
    return state.feedback
  },

  /**
   * Check if session is complete
   */
  isComplete(state: SessionState): boolean {
    return state.phase === "complete"
  },

  /**
   * Get batch metadata
   */
  getBatchMetadata(state: SessionState): BatchMetadata | null {
    return state.dataRef.currentBatchMeta
  },

  /**
   * Get total batch count
   */
  getBatchCount(state: SessionState): number {
    return state.dataRef.batchCount
  },

  /**
   * Get hydration error
   */
  getError(state: SessionState): string | null {
    return state.dataRef.error
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CREATORS
// ═══════════════════════════════════════════════════════════════════════════

export const actions = {
  /**
   * Request catalog load
   */
  requestCatalog(): SessionEvent {
    return { type: "REQUEST_CATALOG" }
  },

  /**
   * Select a topik
   */
  selectTopik(key: string): SessionEvent {
    return { type: "SELECT_TOPIK", key }
  },

  /**
   * Change to different topik
   */
  changeTopik(): SessionEvent {
    return { type: "CHANGE_TOPIK" }
  },

  /**
   * Start chat
   */
  startChat(): SessionEvent {
    return { type: "START_CHAT" }
  },

  /**
   * Pause chat
   */
  pauseChat(): SessionEvent {
    return { type: "PAUSE_CHAT" }
  },

  /**
   * Resume chat
   */
  resumeChat(): SessionEvent {
    return { type: "RESUME_CHAT" }
  },

  /**
   * Reset session
   */
  resetSession(): SessionEvent {
    return { type: "RESET_SESSION" }
  },

  /**
   * Advance to next message
   */
  advanceMessage(): SessionEvent {
    return { type: "ADVANCE_MESSAGE" }
  },

  /**
   * Jump to specific message
   */
  jumpToMessage(index: number): SessionEvent {
    return { type: "JUMP_MESSAGE", index }
  },

  /**
   * Start quiz
   */
  startQuiz(): SessionEvent {
    return { type: "START_QUIZ" }
  },

  /**
   * Submit answer
   */
  submitAnswer(correct: boolean, userAnswer?: string): SessionEvent {
    return { type: "ANSWER_SUBMITTED", correct, userAnswer }
  },

  /**
   * Dismiss feedback / advance to next question
   */
  advanceQuestion(): SessionEvent {
    return { type: "ADVANCE_QUESTION" }
  },

  /**
   * Mark batch as passed
   */
  passBatch(): SessionEvent {
    return { type: "BATCH_PASSED" }
  },

  /**
   * Mark batch as failed
   */
  failBatch(): SessionEvent {
    return { type: "BATCH_FAILED" }
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH ACCESSORS - Read from repository via cursor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current batch from repository
 * Precondition: state.phase === "active" and dataRef.status === "ready"
 */
export function getCurrentBatch(state: SessionState): ConversationBatch | null {
  const { dataRef, active } = state

  if (!dataRef.batches || !active) return null

  return dataRef.batches[active.cursor.batch] ?? null
}

export function getCurrentMessage(state: SessionState): Message | null {
  const batch = getCurrentBatch(state)
  if (!batch || !state.active) return null

  return batch.messages[state.active.cursor.message] ?? null
}

export function getCurrentQuestion(state: SessionState): Question | null {
  const batch = getCurrentBatch(state)
  if (!batch || !state.active) return null

  return batch.questions[state.active.cursor.question] ?? null
}

export function getVisibleMessages(state: SessionState): Array<Message> {
  const batch = getCurrentBatch(state)
  if (!batch || !state.active) return []

  return batch.messages.slice(0, state.active.cursor.message + 1)
}

export function getAllMessages(state: SessionState): Array<Message> {
  const batch = getCurrentBatch(state)
  return batch?.messages ?? []
}

export function getAllQuestions(state: SessionState): Array<Question> {
  const batch = getCurrentBatch(state)
  return batch?.questions ?? []
}

// ═══════════════════════════════════════════════════════════════════════════
// CATALOG ACCESSORS - Read from state.dataRef.catalog.data 
// ═══════════════════════════════════════════════════════════════════════════
export function getAvailableTopiks(
  state: SessionState
): Array<TopikMetadata> {
  return state.dataRef.catalog.data ?? []
}

export function getTopikMetadata(
  state: SessionState,
  key: string
): TopikMetadata | undefined {
  return state.dataRef.catalog.data?.find((t) => t.key === key)
}
