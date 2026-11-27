/**
 * What another workspace may know about soundbites without carrying them
 * (packages/some-vite-config/AUDIENCES.md, A2): plain values, no code. Voice
 * reflections and the drama's scene notes (www's `lib/reflection-voice`,
 * `lib/scene-voice`) record to the same limits.
 */
export {
  JOURNAL_TAKES_MAX_BYTES,
  SOUNDBITE_BITS_PER_SECOND,
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
  SOUNDBITE_TAKE_LIMITS,
  SOUNDBITE_TAKE_MAX_BYTES,
  SOUNDBITES_MAX_BYTES,
} from "./lib/policy"

/** How long home is given to hear a take, and how often it is asked. */
export type { HearingTiming } from "./lib/idea/hearing-timing"
export { HEARING_TIMING } from "./lib/idea/hearing-timing"

/** Each kind of take home keeps, as home names it (Takes, TAKES20). */
export { TAKE_OFS } from "./lib/library/take-ofs"

/** How home matched a game bite to its play, or why not (GWB14). */
export { MATCH_METHODS } from "./lib/library/take-ofs"
