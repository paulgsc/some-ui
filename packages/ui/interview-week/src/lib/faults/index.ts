/**
 * The faults of an interview week's takes (#2934).
 *
 * The measured half comes from code, from the words home heard and their
 * timings: an answer's fillers, pauses, mumbling, pace and length, and a
 * teleprompter read's misreads, pauses at breaks against mid-phrase, pace
 * variation and lead-in. The judged half is a schema the model fills (STAR,
 * hedges, a decision's options, why, trade-off and undo). Nothing here reads
 * a clock, the network or storage, and nothing grades: the essay counts.
 */
export {
  type AnswerFaults,
  AnswerFaultsSchema,
  type AnswerTake,
  AnswerTakeSchema,
  measureAnswer,
} from "./answer"
export {
  type JudgedAnswer,
  JudgedAnswerSchema,
  type JudgedPart,
  type PartMark,
} from "./judged"
export {
  measureRead,
  type ReadFaults,
  ReadFaultsSchema,
  type ReadTake,
  ReadTakeSchema,
} from "./read"
export {
  ANSWER_PAUSE_MS,
  MIN_PHRASE_WORDS,
  MUMBLE_P,
  READ_PAUSE_MS,
  REPEAT_WINDOW,
} from "./thresholds"
export { FILLERS, type HeardWord, HeardWordSchema, wordsOf } from "./words"
