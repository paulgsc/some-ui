/**
 * Core Session Domain Types
 * Framework-agnostic session state machine types
 */

import type {
  ConversationBatch,
  TopikManifestFile,
  TopikMetadata,
} from "@chat/lib/topik"

// ═══════════════════════════════════════════════════════════════════════════
// PHASE HIERARCHY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Top-level session phases
 * Minimal, stable enumeration
 */
export type SessionPhase =
  | "selecting" // User is choosing content
  | "hydrating" // Content is being loaded
  | "active" // Session is running (chat or quiz)
  | "complete" // Session finished

/**
 * Catalog status
 * Tracks metadata loading state
 */
export type CatalogStatus = "idle" | "loading" | "ready" | "failed"

/**
 * Catalog loading state (orthogonal to phase)
 */
export type CatalogState = {
  status: CatalogStatus
  data: Array<TopikMetadata> | null
  error: string | null
}

/**
 * Active session mode
 * Determines behavior within "active" phase
 */
export type SessionMode = "chat" | "quiz"

/**
 * Chat playback state
 */
export type PlayState = "running" | "paused"

/**
 * Quiz stage progression
 */
export type QuizStage = "question" | "feedback" | "summary"

// ═══════════════════════════════════════════════════════════════════════════
// CURSOR & PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic iteration cursor
 * Tracks position across batch/message/question hierarchy
 */
export type SessionCursor = {
  batch: number
  message: number
  question: number
}

/**
 * Active session state details
 * Only relevant when phase === "active"
 */
export type ActiveSessionState = {
  mode: SessionMode
  playState: PlayState
  quizStage: QuizStage
  cursor: SessionCursor
  score: number
  timeRemaining: number
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hydration status
 * Tracks loading state without embedding payload
 */
export type HydrationStatus = "empty" | "loading" | "ready" | "failed"

/**
 * Data reference - FSM does own the batches
 */
export type DataReference = {
  // Catalog state (orthogonal to phase)
  catalog: CatalogState

  // Selected topik
  topikKey: string | null
  batches: Array<ConversationBatch> | null
  status: HydrationStatus
  error: string | null

  // Metadata only - actual batches live in repository
  batchCount: number
  currentBatchMeta: BatchMetadata | null
}

/**
 * Minimal batch metadata
 * FSM only needs counts, not content
 */
export type BatchMetadata = {
  id: number
  messageCount: number
  questionCount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quiz feedback data
 * Persisted during "feedback" stage
 */
export type FeedbackData = {
  isCorrect: boolean
  questionType: "multiple-choice" | "text-input"
  userAnswer?: string
  correctAnswer: string
  explanation: string
  grammarNote?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Session state - O(1) memory footprint
 *
 * INVARIANTS:
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

// ═══════════════════════════════════════════════════════════════════════════
// EVENT ALGEBRA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Catalog events (from TanStack Query)
 */
export type CatalogEvent =
  | { type: "CATALOG_LOADING" }
  | { type: "CATALOG_SUCCESS"; data: Array<TopikMetadata> }
  | { type: "CATALOG_FAILURE"; error: string }

/**
 * User action to request catalog
 */
export type CatalogRequestEvent = { type: "REQUEST_CATALOG" }

/**
 * Selection events
 */
export type SelectionEvent =
  | { type: "SELECT_TOPIK"; key: string }
  | { type: "CHANGE_TOPIK" }

/**
 * Hydration events
 */
export type HydrationEvent =
  | { type: "HYDRATION_STARTED"; key: string }
  | {
      type: "HYDRATION_SUCCESS"
      key: string
      batches: Array<ConversationBatch>
    }
  | { type: "HYDRATION_FAILURE"; key: string; error: string }

/**
 * Iteration events
 */
export type IterationEvent =
  | { type: "ADVANCE_MESSAGE" }
  | { type: "ADVANCE_QUESTION" }
  | { type: "ADVANCE_BATCH" }
  | { type: "SET_CURSOR"; cursor: Partial<SessionCursor> }
  | { type: "JUMP_MESSAGE"; index: number }

/**
 * Mode control events
 */
export type ModeEvent =
  | { type: "START_SESSION" }
  | { type: "START_CHAT" }
  | { type: "START_QUIZ" }
  | { type: "PAUSE_CHAT" }
  | { type: "RESUME_CHAT" }
  | { type: "RESET_SESSION" }

/**
 * Evaluation events
 */
export type EvaluationEvent =
  | { type: "ANSWER_SUBMITTED"; correct: boolean; userAnswer?: string }
  | { type: "DISMISS_FEEDBACK" }
  | { type: "BATCH_PASSED" }
  | { type: "BATCH_FAILED" }

/**
 * Timer events
 */
export type TimerEvent = { type: "TIMER_TICK" }

/**
 * Complete event union
 */
export type SessionEvent =
  | CatalogRequestEvent
  | CatalogEvent
  | SelectionEvent
  | HydrationEvent
  | IterationEvent
  | ModeEvent
  | EvaluationEvent
  | TimerEvent

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Side effects to be executed by runtime
 * FSM emits intents, runtime performs them
 */
export type SessionEffect =
  | { type: "TRIGGER_CATALOG_QUERY" } // Tell executor to ensure catalog query runs
  | { type: "TRIGGER_TOPIK_QUERY"; key: string } // Tell executor to trigger topik query
  | { type: "START_TIMER" }
  | { type: "STOP_TIMER" }
  | { type: "PLAY_AUDIO" }
  | { type: "STOP_AUDIO" }
  | { type: "NOTIFY_BATCH_COMPLETE"; batchIndex: number }
  | { type: "NOTIFY_SESSION_COMPLETE" }

/**
 * Reducer result
 * Returns new state + effects to execute
 */
export type ReducerResult = {
  state: SessionState
  effects: Array<SessionEffect>
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY BRIDGE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bridge between FSM and TanStack Query
 * Executor uses this to trigger queries and observe their state
 */
export type IQueryBridge = {
  fetchCatalog(): Promise<TopikManifestFile>
  fetchTopik(key: string): Promise<Array<ConversationBatch>>
  /**
   * Get cached topik data (synchronous)
   */
  getCachedTopik(key: string): Array<ConversationBatch> | undefined
}

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Repository interface
 * FSM depends on this abstraction, not implementation
 */
export type ITopikRepository = {
  /**
   * Load batches for a topik
   * Must be idempotent within same browser session (V5)
   */
  load(key: string): Promise<Array<ConversationBatch>>
}

/**
 * Metadata repository interface
 */
export type ITopikMetadataRepository = {
  /**
   * Load catalog of available topiks
   */
  loadCatalog(): Promise<TopikManifestFile>
}

// ═══════════════════════════════════════════════════════════════════════════
// MACHINE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Session machine interface
 * Framework-agnostic actor model
 */
export type ISessionMachine = {
  /**
   * Get current state (immutable)
   */
  getState(): SessionState

  /**
   * Dispatch event
   * Returns effects to execute
   */
  dispatch(event: SessionEvent): Array<SessionEffect>

  /**
   * Subscribe to state changes
   * Returns unsubscribe function
   */
  subscribe(listener: (state: SessionState) => void): () => void

  /**
   * Destroy machine and cleanup
   */
  destroy(): void
}
