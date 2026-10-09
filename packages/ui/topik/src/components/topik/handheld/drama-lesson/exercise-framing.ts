/**
 * What frames a screen as an exercise or a score, which no handheld screen
 * may be (docs/makjang/README.md, M2). Test-only.
 */
export const EXERCISE_FRAMING =
  /\bCheck\b|\bQuestion \d|\b\d+ of \d+\b|\b\d+\s*\/\s*\d+\b|understood|correct|score|Up next|Conversation/i
