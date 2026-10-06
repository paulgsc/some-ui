/** Framework-agnostic types for the session state machine. */

import type {
  ConversationBatch,
  TopikManifestFile,
  TopikMetadata,
} from "@topik/lib/topik"

type SessionPhase =
  | "selecting" // User is choosing content
  | "hydrating" // Content is being loaded
  | "active" // Session is running (chat or quiz)
  | "complete" // Session finished

export type CatalogStatus = "idle" | "loading" | "ready" | "failed"

/** Catalog loading state, orthogonal to phase. */
type CatalogState = {
  status: CatalogStatus
  data: Array<TopikMetadata> | null
  error: string | null
}

/** Behaviour within the "active" phase. */
type SessionMode = "chat" | "quiz"

export type PlayState = "running" | "paused"

export type QuizStage = "question" | "feedback" | "summary"

/** Position across the batch/message/question hierarchy. */
export type SessionCursor = {
  batch: number
  message: number
  question: number
}

/** Only set while phase === "active". */
export type ActiveSessionState = {
  mode: SessionMode
  playState: PlayState
  quizStage: QuizStage
  cursor: SessionCursor
  score: number
  timeRemaining: number
}

type HydrationStatus = "empty" | "loading" | "ready" | "failed"

type DataReference = {
  catalog: CatalogState

  topikKey: string | null
  batches: Array<ConversationBatch> | null
  status: HydrationStatus
  error: string | null

  batchCount: number
  currentBatchMeta: BatchMetadata | null
}

/** The FSM needs only counts, not content. */
export type BatchMetadata = {
  id: number
  messageCount: number
  questionCount: number
}

/** Held during the "feedback" stage. */
export type FeedbackData = {
  isCorrect: boolean
  questionType: "multiple-choice" | "text-input"
  userAnswer?: string
  correctAnswer: string
  explanation: string
  grammarNote?: string
}

/**
 * Session state - O(1) memory footprint.
 *
 * - Does not embed large batch payloads (V1)
 * - All fields are serializable primitives (V12)
 * - Cursor bounds maintained by reducer (V10)
 */
export type SessionState = {
  phase: SessionPhase
  dataRef: DataReference
  active: ActiveSessionState | null
  feedback: FeedbackData | null

  // Hydration epoch tracking (V5, V6)
  hydrationEpoch: number
  sessionEpoch: number
}

/** From TanStack Query. */
type CatalogEvent =
  | { type: "CATALOG_LOADING" }
  | { type: "CATALOG_SUCCESS"; data: Array<TopikMetadata> }
  | { type: "CATALOG_FAILURE"; error: string }

type CatalogRequestEvent = { type: "REQUEST_CATALOG" }

type SelectionEvent =
  | { type: "SELECT_TOPIK"; key: string }
  | { type: "CHANGE_TOPIK" }

type HydrationEvent =
  | { type: "HYDRATION_STARTED"; key: string }
  | {
      type: "HYDRATION_SUCCESS"
      key: string
      batches: Array<ConversationBatch>
    }
  | { type: "HYDRATION_FAILURE"; key: string; error: string }

type IterationEvent =
  | { type: "ADVANCE_MESSAGE" }
  | { type: "ADVANCE_QUESTION" }
  | { type: "ADVANCE_BATCH" }
  | { type: "SET_CURSOR"; cursor: Partial<SessionCursor> }
  | { type: "JUMP_MESSAGE"; index: number }

type ModeEvent =
  | { type: "START_SESSION" }
  | { type: "START_CHAT" }
  | { type: "START_QUIZ" }
  | { type: "PAUSE_CHAT" }
  | { type: "RESUME_CHAT" }
  | { type: "RESET_SESSION" }

type EvaluationEvent =
  | { type: "ANSWER_SUBMITTED"; correct: boolean; userAnswer?: string }
  | { type: "DISMISS_FEEDBACK" }
  | { type: "BATCH_PASSED" }
  | { type: "BATCH_FAILED" }

type TimerEvent = { type: "TIMER_TICK" }

export type SessionEvent =
  | CatalogRequestEvent
  | CatalogEvent
  | SelectionEvent
  | HydrationEvent
  | IterationEvent
  | ModeEvent
  | EvaluationEvent
  | TimerEvent

/** Intents the FSM emits; the runtime performs them. */
export type SessionEffect =
  | { type: "TRIGGER_CATALOG_QUERY" }
  | { type: "TRIGGER_TOPIK_QUERY"; key: string }
  | { type: "START_TIMER" }
  | { type: "STOP_TIMER" }
  | { type: "PLAY_AUDIO" }
  | { type: "STOP_AUDIO" }
  | { type: "NOTIFY_BATCH_COMPLETE"; batchIndex: number }
  | { type: "NOTIFY_SESSION_RESET" }
  | { type: "NOTIFY_SESSION_COMPLETE" }

export type ReducerResult = {
  state: SessionState
  effects: Array<SessionEffect>
}

/** How the executor triggers TanStack queries and reads their state. */
export type IQueryBridge = {
  fetchCatalog(): Promise<TopikManifestFile>
  fetchTopik(key: string): Promise<Array<ConversationBatch>>
  /** Synchronous. */
  getCachedTopik(key: string): Array<ConversationBatch> | undefined
}

export type ITopikRepository = {
  /** Must be idempotent within the same browser session (V5). */
  load(key: string): Promise<Array<ConversationBatch>>
}

export type ITopikMetadataRepository = {
  loadCatalog(): Promise<TopikManifestFile>
}

/** Framework-agnostic actor over the session reducer. */
export type ISessionMachine = {
  /** Current state (immutable). */
  getState(): SessionState
  /** Returns the effects to execute. */
  dispatch(event: SessionEvent): Array<SessionEffect>
  /** Returns the unsubscribe. */
  subscribe(listener: (state: SessionState) => void): () => void
  destroy(): void
}
