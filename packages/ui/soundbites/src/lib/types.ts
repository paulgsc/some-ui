/**
 * How a soundbite came to be recorded. Kept with each one, because "I tapped
 * the reminder and said why not" and "I opened the app to say why not" are
 * different data points for whoever listens later.
 */
export type SoundbiteSource =
  /** The "Not today? Say why" button on the sessions list. */
  | "sessions"
  /** The "Not today" action on a study reminder notification. */
  | "reminder"
  /** The soundbites page itself. */
  | "direct"

/**
 * What the app knew when a soundbite was saved, captured without asking: the
 * person says why, the app notes when and around what. Whoever (or whatever
 * agent) makes sense of the recordings later reads these beside the audio.
 */
export type SoundbiteContext = {
  source: SoundbiteSource
  /** The most recent `updatedAt` across sessions, or null with none. */
  lastSessionAt: string | null
  /** Sessions started and not finished (active, paused or scheduled). */
  openSessions: number
  /** The phone's IANA time zone, so `recordedAt` reads as local time. */
  timeZone: string
}

/** One kept recording's metadata. The audio itself is stored beside it. */
export type Soundbite = {
  id: string
  /** ISO 8601, UTC. */
  recordedAt: string
  durationMs: number
  /** What `MediaRecorder` produced, e.g. `audio/webm;codecs=opus`. */
  mimeType: string
  bytes: number
  context: SoundbiteContext
}
