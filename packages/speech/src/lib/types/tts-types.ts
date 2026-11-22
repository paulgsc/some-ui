import type { DeviceVoiceChoice } from "@speech/lib/adapters/types"
import type { SpokenLanguage } from "@speech/lib/language"
import type { VoicePart } from "@speech/lib/part"

/** What a queued line asks for, besides its text. */
export type TTSOptions = {
  readonly volume?: number
  readonly playbackRate?: number
  /** The text's language; the session picks the voice for it. */
  readonly language?: SpokenLanguage
  /**
   * A device voice for this one line. Only the session's voice preview
   * sets it (`SpeechQueueManager.preview`).
   */
  readonly voice?: DeviceVoiceChoice
  /** The part the line is read in (`lib/part`). */
  readonly part?: VoicePart
  readonly onStart?: () => void
  readonly onEnd?: () => void
  readonly onError?: (error: Error) => void
  readonly onProgress?: (currentTime: number, duration: number) => void
  /** Word-boundary progress, where the backend reports it. */
  readonly onBoundary?: (charIndex: number, charLength: number) => void
}
