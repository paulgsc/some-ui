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
] as const
