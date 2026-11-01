/**
 * A voice reflection: `@some-ui/voice-capture`'s voice note, saved as a
 * reflection of its session. It decides nothing but what a save keeps.
 */
import { SOUNDBITE_TAKE_LIMITS } from "@some-ui/soundbites/contract"
import type {
  BlobShelf,
  StartRecording,
  VoiceNoteRuntime,
} from "@some-ui/voice-capture"
// eslint-disable-next-line one-owner/no-local-microphone -- reflection voice keeps voiceNoteRuntime until it moves onto the take pattern (MIC5, #2444)
import { ShelfFullError, voiceNoteRuntime } from "@some-ui/voice-capture"

import type { KeepResult, Reflection } from "@/lib/session-reflection"

export type VoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  keep: (reflection: Reflection) => KeepResult
  letGo: (ids: ReadonlyArray<string>) => void
  /** A kept voice reflection whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
}

/** `start`'s `atMs` is how far into the session, read as the take starts. */
export function createVoiceNote(
  ports: VoicePorts,
  sessionId: string
): VoiceNoteRuntime {
  return voiceNoteRuntime(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      /**
       * The reflection first, so it holds its slot (or says there is none),
       * then its audio; audio that cannot be kept takes the reflection back
       * out. In that order, audio on the shelf always has a reflection
       * naming it, and `sweepOrphans` can never remove a take still being
       * saved. If taking it back out is refused too, `sweepOrphans` lets it
       * go at the next launch.
       */
      save: (take, atMs, saved) => {
        const id = ports.newId()
        const kept = ports.keep({
          id,
          sessionId,
          createdAt: new Date(ports.now()).toISOString(),
          atMs,
          body: {
            kind: "voice",
            durationMs: Math.round(take.durationMs),
            mimeType: take.mimeType,
            bytes: take.blob.size,
          },
        })
        if (kept !== "kept") {
          saved(kept)
          return
        }
        ports.saving(id, true)
        ports.audio.put(id, take.blob).then(
          () => {
            ports.saving(id, false)
            saved("kept")
          },
          (error: unknown) => {
            ports.saving(id, false)
            ports.letGo([id])
            saved(error instanceof ShelfFullError ? "full" : "failed")
          }
        )
      },
    },
    SOUNDBITE_TAKE_LIMITS
  )
}
