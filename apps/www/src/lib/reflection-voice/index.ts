/**
 * Voice reflections on the phone: a take (`./runtime`) on the phone's
 * microphone, its audio on a shelf of its own, and letting reflections go
 * with their audio. Phone-only (`build.paths.ts`): reach it behind an inline
 * `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { BlobShelf } from "@some-ui/voice-capture"
import { blobShelf, micRecorder } from "@some-ui/voice-capture"

import { reflections } from "@/lib/session-reflection"

import { REFLECTION_AUDIO_MAX_BYTES } from "./budget"
import type { VoiceRuntime } from "./runtime"
import { createVoiceNote } from "./runtime"

export type { Outcome, VoiceState } from "./machine"
export type { VoiceRuntime } from "./runtime"

let shelf: BlobShelf | null = null

/** One shelf per page load, so its database opens once. */
export function reflectionAudio(): BlobShelf {
  shelf ??= blobShelf({
    dbName: "some-ui.reflection-audio",
    maxBytes: REFLECTION_AUDIO_MAX_BYTES,
  })
  return shelf
}

export function phoneVoiceNote(sessionId: string): VoiceRuntime {
  return createVoiceNote(
    {
      startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
      audio: reflectionAudio(),
      keep: (reflection) => reflections.keep(reflection),
      letGo: (ids) => reflections.letGo(ids),
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
    },
    sessionId
  )
}

/**
 * Lets these go, and their audio with them. Audio that fails to go is left
 * for `sweepOrphanAudio`: once its reflection is gone, nothing names it.
 */
export function letGoReflections(ids: ReadonlyArray<string>): void {
  reflections.letGo(ids)
  reflectionAudio()
    .remove(ids)
    .catch(() => undefined)
}

/**
 * Audio whose reflection is gone (the app closed between the two removals):
 * removed, so the shelf holds only what the list names. A take being saved
 * is never caught here: its reflection is kept before its audio is written.
 * Best effort, and nothing waits on it.
 */
export function sweepOrphanAudio(): void {
  const audio = reflectionAudio()
  audio
    .ids()
    .then((ids) => {
      // Read after the ids: a reflection kept meanwhile names its audio.
      const named = new Set(reflections.getSnapshot().kept.map((r) => r.id))
      return audio.remove(ids.filter((id) => !named.has(id)))
    })
    .catch(() => undefined)
}
