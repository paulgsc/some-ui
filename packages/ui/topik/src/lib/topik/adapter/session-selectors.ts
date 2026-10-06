/**
 * Pure selectors and action creators over SessionState. All data flows
 * through the FSM, not the query cache: no IO, no cache reads, no side effects.
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
} from "@topik/lib/topik"

export const selectors = {
  getPhase(state: SessionState): SessionState["phase"] {
    return state.phase
  },

  getCatalogStatus(state: SessionState): CatalogStatus {
    return state.dataRef.catalog.status
  },

  getCatalogError(state: SessionState): string | null {
    return state.dataRef.catalog.error
  },

  isCatalogLoading(state: SessionState): boolean {
    return state.dataRef.catalog.status === "loading"
  },

  isCatalogReady(state: SessionState): boolean {
    return state.dataRef.catalog.status === "ready"
  },

  isSelecting(state: SessionState): boolean {
    return state.phase === "selecting"
  },

  getTopikKey(state: SessionState): string | null {
    return state.dataRef.topikKey
  },

  /** Hydrating a topik. */
  isLoading(state: SessionState): boolean {
    return state.phase === "hydrating"
  },

  isActive(state: SessionState): boolean {
    return state.phase === "active" && state.active !== null
  },

  isInChat(state: SessionState): boolean {
    return state.active?.mode === "chat"
  },

  isInQuiz(state: SessionState): boolean {
    return state.active?.mode === "quiz"
  },

  isChatPlaying(state: SessionState): boolean {
    return state.active?.mode === "chat" && state.active.playState === "running"
  },

  isChatPaused(state: SessionState): boolean {
    return state.active?.mode === "chat" && state.active.playState === "paused"
  },

  getCursor(state: SessionState): SessionCursor | null {
    return state.active?.cursor ?? null
  },

  getBatchIndex(state: SessionState): number {
    return state.active?.cursor.batch ?? 0
  },

  getMessageIndex(state: SessionState): number {
    return state.active?.cursor.message ?? 0
  },

  getQuestionIndex(state: SessionState): number {
    return state.active?.cursor.question ?? 0
  },

  getScore(state: SessionState): number {
    return state.active?.score ?? 0
  },

  getTimeRemaining(state: SessionState): number {
    return state.active?.timeRemaining ?? 0
  },

  getQuizStage(state: SessionState): QuizStage | null {
    return state.active?.mode === "quiz" ? state.active.quizStage : null
  },

  getFeedback(state: SessionState): FeedbackData | null {
    return state.feedback
  },

  isComplete(state: SessionState): boolean {
    return state.phase === "complete"
  },

  getBatchMetadata(state: SessionState): BatchMetadata | null {
    return state.dataRef.currentBatchMeta
  },

  getBatchCount(state: SessionState): number {
    return state.dataRef.batchCount
  },

  getError(state: SessionState): string | null {
    return state.dataRef.error
  },
}

export const actions = {
  requestCatalog(): SessionEvent {
    return { type: "REQUEST_CATALOG" }
  },

  selectTopik(key: string): SessionEvent {
    return { type: "SELECT_TOPIK", key }
  },

  changeTopik(): SessionEvent {
    return { type: "CHANGE_TOPIK" }
  },

  startChat(): SessionEvent {
    return { type: "START_CHAT" }
  },

  pauseChat(): SessionEvent {
    return { type: "PAUSE_CHAT" }
  },

  resumeChat(): SessionEvent {
    return { type: "RESUME_CHAT" }
  },

  resetSession(): SessionEvent {
    return { type: "RESET_SESSION" }
  },

  advanceMessage(): SessionEvent {
    return { type: "ADVANCE_MESSAGE" }
  },

  jumpToMessage(index: number): SessionEvent {
    return { type: "JUMP_MESSAGE", index }
  },

  startQuiz(): SessionEvent {
    return { type: "START_QUIZ" }
  },

  submitAnswer(correct: boolean, userAnswer?: string): SessionEvent {
    return { type: "ANSWER_SUBMITTED", correct, userAnswer }
  },

  /** Dismisses feedback and advances to the next question. */
  advanceQuestion(): SessionEvent {
    return { type: "ADVANCE_QUESTION" }
  },

  passBatch(): SessionEvent {
    return { type: "BATCH_PASSED" }
  },

  failBatch(): SessionEvent {
    return { type: "BATCH_FAILED" }
  },
}

/** Precondition: state.phase === "active" and dataRef.status === "ready". */
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

export function getAvailableTopiks(state: SessionState): Array<TopikMetadata> {
  return state.dataRef.catalog.data ?? []
}

export function getTopikMetadata(
  state: SessionState,
  key: string
): TopikMetadata | undefined {
  return state.dataRef.catalog.data?.find((t) => t.key === key)
}
