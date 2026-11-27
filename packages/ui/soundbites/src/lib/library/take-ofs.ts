/**
 * What home calls a voice note's kind, in home's order (paulgsc/server
 * `voice_repo::Of`): a plain value, so the contract can carry it to a
 * workspace that doesn't carry soundbites (`../../contract`). www's
 * `VOICE_OFS` is held to it by a test.
 */
export const TAKE_OFS = [
  "reflection",
  "jobs",
  "scene",
  "game",
  "studio",
  "soundbite",
  "lens",
  "leetype",
  "rust-round",
  "interview",
  "hunch",
] as const

/**
 * How home matched a game bite to its play, or why it didn't (paulgsc/server
 * `bite_match::Method`): the play at or before the bite (`nearest`), the
 * play the offer on screen pointed at (`next`, #3040), or none found, the
 * scenario about no one play, or nothing said yet to match it under.
 */
export const MATCH_METHODS = [
  "nearest",
  "next",
  "unmatched",
  "not-a-play",
  "no-scenario",
] as const

export type MatchMethod = (typeof MATCH_METHODS)[number]
