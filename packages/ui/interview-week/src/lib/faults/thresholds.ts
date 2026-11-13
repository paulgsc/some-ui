/**
 * The thresholds the measures use, each with where its value comes from.
 * Every value is a gray-area call recorded in `docs/calls.json` (C263, C264,
 * C266); changing one is a story that moves that call.
 */

/**
 * A gap between two words of an answer at or over this is a pause. Source:
 * #2934's suggested default (2 s). Shorter gaps are breath and thought; a gap
 * this long in a spoken answer reads as a lost thread. Inclusive, so a gap of
 * exactly 2000 ms counts (C263).
 */
export const ANSWER_PAUSE_MS = 2000

/**
 * A gap between two words of a teleprompter read at or over this is a pause,
 * placed at a break or mid-phrase. Source: phrasing pauses at a comma run a
 * few hundred milliseconds, and whisper's word timings drift by a couple of
 * hundred, so half a second is the shortest gap that is surely a pause rather
 * than timing noise (C263).
 */
export const READ_PAUSE_MS = 500

/**
 * A word heard with a probability under this is mumbled. Source: whisper's
 * per-word `probability`, carried as `p`; under one half the model was less
 * sure of the word than not. A word without `p` is neither (C264).
 */
export const MUMBLE_P = 0.5

/**
 * A phrase of a read needs this many words, fillers aside, before its pace
 * counts toward the pace variation: one or two words are too short a span
 * for whisper's timings to give a rate (C266).
 */
export const MIN_PHRASE_WORDS = 3

/**
 * A word the reader added counts as repeated when the same word was spoken
 * within this many words before or after it ("the the", "I went, I went").
 * Source: a restart repeats the last few words; three covers the common
 * restart of a short phrase without reaching back into the sentence (C266).
 */
export const REPEAT_WINDOW = 3
