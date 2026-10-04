export * from "./components"
export * from "./hooks"
export * from "./types/exercise"
export * from "./types/leetype"
export { nextExercise } from "./lib/leetype/exercises"
export type { SelectionState } from "./lib/leetype/exercises"
export {
  claimOf,
  claimPoolOf,
  READING_OPTION_COUNT,
  readingHunkOf,
  readingProbeOf,
} from "./lib/leetype/reading-probe"
export type {
  Claim,
  ReadingFamily,
  ReadingHunk,
  ReadingOption,
  ReadingProbe,
  ReadingRow,
} from "./lib/leetype/reading-probe"
// Rounds (Def. 1.7): what the round CRM (`@some-ui/lesson-crm`) needs to
// check and publish a round with the same prompt and checks the learner's
// "make your own round" uses.
export { GenerateRound } from "./components/round/generate-round"
export { buildRoundPrompt } from "./lib/leetype/generation"
export type { RoundRequest } from "./lib/leetype/generation"
export { fixRequest, intakeRound } from "./lib/leetype/generation/intake"
export type { RoundIntake } from "./lib/leetype/generation/intake"
export { serializeRound } from "./lib/leetype/round-export"
export { RoundSchema } from "./types/authored-round"
export type { Round } from "./types/authored-round"
export { AUTHORED_ROUNDS } from "./lib/leetype/authored-rounds"
// Margin notes (canon Rem. 3.7): the port a host implements to give the
// phone surface a speech recognizer the browser lacks (the Android app's).
export type {
  Dictation,
  DictationFailure,
  Listening,
} from "./lib/leetype/notes/dictation"
