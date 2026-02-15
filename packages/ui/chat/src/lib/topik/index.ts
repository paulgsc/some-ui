/**
 * Session State Machine - Public API
 *
 * This is the main entry point for the session state machine.
 * Import from this file to get all core functionality.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type {
  // State types
  SessionState,
  SessionPhase,
  SessionMode,
  PlayState,
  QuizStage,
  SessionCursor,
  ActiveSessionState,
  HydrationStatus,
  DataReference,
  BatchMetadata,
  FeedbackData,
  CatalogStatus,

  // Event types
  SessionEvent,
  SelectionEvent,
  HydrationEvent,
  IterationEvent,
  ModeEvent,
  EvaluationEvent,
  TimerEvent,

  // Effect types
  SessionEffect,
  ReducerResult,

  // Interfaces
  ITopikRepository,
  ITopikMetadataRepository,
  ISessionMachine,

  // Tasnstack Bridge
  IQueryBridge,
} from "./core/session-types"

export type {
  ConversationBatch,
  Message,
  Question,
  TopikFile,
} from "./entity/topik-types"

export type {
  TopikMetadata,
  TopikManifest,
  TopikManifestFile,
} from "./entity/topik-metadata"
export {
  TopikManifestSchema,
  TopikMetadataSchema,
} from "./entity/topik-metadata"

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export { sessionReducer, createInitialState } from "./core/session-reducer"

export { TopikRepository, createTopikRepository } from "./core/topik-repository"
export {
  TopikMetadataRepository,
  createTopikMetadataRepository,
} from "./core/topik-metadata-repository"

export { SessionMachine, createSessionMachine } from "./core/session-machine"

export { EffectExecutor, createEffectExecutor } from "./core/effect-executor"
export type { EffectExecutorConfig } from "./core/effect-executor"
export type {
  SpeechQueueService,
  TTSEffectHandler,
} from "./core/tts-effect-handler"

// ═══════════════════════════════════════════════════════════════════════════
// SELECTORS & ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export {
  selectors,
  actions,
  getCurrentBatch,
  getCurrentMessage,
  getCurrentQuestion,
  getVisibleMessages,
  getAllMessages,
  getAllQuestions,
} from "./adapter/session-selectors"

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export { TopikFileSchema } from "./entity/topik-types"

// ═══════════════════════════════════════════════════════════════════════════
// REACT ADAPTER (optional)
// ═══════════════════════════════════════════════════════════════════════════

export { useKoreanStudyPageVM } from "./adapter/hooks"
export { useSession } from "./adapter/hooks"
export { useTopikCurrentBatch } from "./adapter/server"
export { SessionConfigProvider, useSessionConfig } from "./adapter"
