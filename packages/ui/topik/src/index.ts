export * from "./components"

/**
 * The applet's data seam, for hosts that own where the material lives.
 *
 * `KoreanStudyPage` takes `topikRepository`/`metadataRepository` overrides,
 * and those props are unusable from outside this package unless the
 * factories that build them are public too. `apps/www` uses them to resolve
 * the manifest per deployment - fetched from `public/topiks` where one is
 * served, empty on GitHub Pages, which ships no companion data.
 */
export {
  createTopikMetadataRepository,
  createTopikRepository,
} from "./lib/topik"
export type {
  ITopikMetadataRepository,
  ITopikRepository,
  TopikManifestFile,
} from "./lib/topik"

/** Conversation-lesson intake, for the operator's lesson CRM (a LAN workspace). */
export { intakeLesson } from "./lib/topik/generation/intake"
export type { Intake } from "./lib/topik/generation/intake"
export type { ConversationBatch, TopikMetadata } from "./lib/topik"
/** Scene-tree intake, for the lesson CRM. */
export {
  intakeTree,
  treeEntry,
  treeFindingRow,
  treeFixRequest,
  treeSummary,
} from "./lib/topik/generation/tree-intake"
export type {
  FindingRow,
  TreeEntryForm,
  TreeIntake,
} from "./lib/topik/generation/tree-intake"
/** The activity served scene trees are saved under, for the lesson CRM. */
export { TREE_ACTIVITY } from "./lib/topik/adapter/tree-feed"
export type { TreeFinding } from "./lib/topik/core/tree-audit"
/** The generator prompts, for the operator to hand a model a batch lesson. */
export {
  buildLessonPrompt,
  buildTreePrompt,
  DEFAULT_CONVERSATIONS,
  TOPIK_LEVELS,
} from "./lib/topik/generation"
export type { LessonFormat, TopikLevel } from "./lib/topik/generation"
/** The lesson's conversations as the study session's chat plays them. */
export { ConversationPreview } from "./components/topik/conversation-preview"

/**
 * Read-aloud content (canon Def. 4.8, Cor. 4.6): the deck format, its
 * load-time check, and the bundled starter deck. Public so a host can load a
 * served or generated deck and fall back to the starter when it fails to
 * parse (canon Thm. 8.2).
 */
export {
  parseReadAloudDeck,
  READ_ALOUD_LEVELS,
} from "./lib/topik/read-aloud/content"
export type {
  ContentFinding,
  ContentFindingKind,
  ParsedDeck,
  ReadAloudDeck,
  ReadAloudLevel,
  ReadAloudLine,
  ReadAloudWord,
  WordOccurrence,
} from "./lib/topik/read-aloud/content"
export { STARTER_DECK } from "./lib/topik/read-aloud/starter"
export { BUNDLED_DECK } from "./lib/topik/read-aloud/bundled"

/** The quiz pane by stage; apps/www's panel-fit page mounts each stage directly. */
export { QuizPanel } from "./components/topik/quiz-panel"

/**
 * The phone's drama by state; apps/www's panel-fit page mounts it at a beat,
 * an open choice and an ending, through a resume point, and the record that
 * ending leaves, so it shows its review.
 */
export { DramaLesson } from "./components/topik/handheld/drama-lesson"
export { lastDramaOf } from "./lib/topik/core/last-drama"
