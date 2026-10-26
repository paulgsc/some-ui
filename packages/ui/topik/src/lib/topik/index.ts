/**
 * Session State Machine - Public API
 *
 * The barrel the package's components import; modules inside src/lib/topik
 * import leaf modules instead (eslint.config.js says why).
 */

// CORE TYPES

export type {
  PlayState,
  QuizStage,
  FeedbackData,
  ITopikRepository,
  ITopikMetadataRepository,
} from "./core/session-types"

export type { ConversationBatch, Message, Question } from "./entity/topik-types"

export type { TopikMetadata, TopikManifestFile } from "./entity/topik-metadata"

// CORE FUNCTIONS

export { createTopikRepository } from "./core/topik-repository"
export { createTopikMetadataRepository } from "./core/topik-metadata-repository"

// REACT ADAPTER

export { useKoreanStudyPageVM } from "./adapter/hooks/use-korean-study-page-vm"
