/**
 * A take of the learner's voice as the phone's ports report it (a scene's
 * voice note, a grammar-lens take): `@some-ui/voice-capture`'s `TakeView`,
 * named here so topik's ports declare it once.
 */
export type VoiceTake =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "recording"; elapsedMs: number }
  | { kind: "keeping" }
