/**
 * How a soundbite came to be recorded. Kept with each one, because "I tapped
 * the reminder and said why not" and "I opened the app to say why not" are
 * different data points for whoever listens later.
 */
export type SoundbiteSource =
  /**
   * "Not today? Say why" beside the study card on Home (the sessions list
   * held it before Home did; the value stays, so older takes still read).
   */
  | "sessions"
  /** The "Not today" action on a study reminder notification. */
  | "reminder"
  /**
   * A comment, not a reason. No longer recorded; kept so older takes still
   * read.
   */
  | "capture"
  /**
   * "Say what stuck" on a finished session's wrap, before that became one of
   * the session's reflections; kept so older takes still read.
   */
  | "wrap"
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
  /**
   * Where it stands on the page (the take pattern's D2 and D3): absent is
   * a current one, as every soundbite kept before these were; `earlier`
   * once a Redo of it was kept; `set-aside` once the person let it go. Both
   * are still kept, audio and all.
   */
  standing?: "earlier" | "set-aside"
  /**
   * When it was set aside, ISO 8601, written with its standing and never
   * after: home's mark is sent with it (MIC2). Absent on one not set aside,
   * and on one set aside before the page noted when.
   */
  setAsideAt?: string
}
