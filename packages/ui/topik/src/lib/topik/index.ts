/**
 * Session State Machine - Public API
 *
 * The barrel the package's components import. A module inside
 * src/lib/topik imports the leaf module that declares a name instead (README,
 * "Module Structure"; eslint.config.js bans this file there): it re-exports
 * core and the React adapter together, so a core module importing it would
 * reach React and close a cycle back to itself.
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
