/**
 * Session State Machine - Public API
 *
 * This is the main entry point for the session state machine.
 * Import from this file to get all core functionality.
 */

// CORE TYPES

export type {
  // State types
  SessionState,
  PlayState,
  QuizStage,
  SessionCursor,
  BatchMetadata,
  FeedbackData,
  CatalogStatus,

  // Event types
  SessionEvent,

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
  MorphismRelation,
  Probe,
  ProbeOption,
  Question,
  TopikFile,
} from "./entity/topik-types"
export { GLOSS_RELATION, ProbeSchema } from "./entity/topik-types"

export type {
  TopikMetadata,
  TopikManifest,
  TopikManifestFile,
} from "./entity/topik-metadata"
export {
  TopikManifestSchema,
  TopikMetadataSchema,
} from "./entity/topik-metadata"

// CORE FUNCTIONS

export { createTopikRepository } from "./core/topik-repository"
export { createTopikMetadataRepository } from "./core/topik-metadata-repository"

export { createSessionMachine } from "./core/session-machine"

export { EffectExecutor, createEffectExecutor } from "./core/effect-executor"

// SELECTORS & ACTIONS

export {
  selectors,
  actions,
  getCurrentBatch,
  getCurrentMessage,
  getVisibleMessages,
} from "./adapter/session-selectors"

// VALIDATION

export { TopikFileSchema } from "./entity/topik-types"

// REACT ADAPTER (optional)

export { useKoreanStudyPageVM } from "./adapter/hooks"
export { useSession } from "./adapter/hooks"
export { useSessionConfig } from "./adapter"
