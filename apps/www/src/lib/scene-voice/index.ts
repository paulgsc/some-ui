/**
 * The next scene said aloud, on the phone (`./runtime`): the microphone, its
 * audio on a shelf of its own, and the draft's notes in a list. One runtime
 * per page load, so the draft and a take under way outlive the screen that
 * shows them. Phone-only (`build.paths.ts`).
 */
import type { IntentError } from "@some-ui/intent-kit"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { FileShare, SceneNote, SceneVoice } from "@some-ui/topik"
import type { BlobShelf } from "@some-ui/voice-capture"
import { blobShelf, micRecorder } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"

import { SCENE_AUDIO_MAX_BYTES, SCENE_NOTES_MAX } from "./budget"
import { createSceneVoice } from "./runtime"

const isNote = (value: unknown): value is SceneNote =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string"

const list = boundedList("some-ui:scene-voice", SCENE_NOTES_MAX, isNote)

/** The draft's notes, oldest first (the list keeps the newest first). */
const notes = {
  read: (): Array<SceneNote> => list.read().reverse(),
  add: (note: SceneNote): boolean => list.put(note, ({ id }) => id === note.id),
  remove: (ids: ReadonlyArray<string>): boolean =>
    list.remove(({ id }) => ids.includes(id)),
}

let shelf: BlobShelf | null = null
/** Notes whose audio is still being written: not yet listed, not orphans. */
const saving = new Set<string>()

/** One shelf per page load, so its database opens once. */
function sceneVoiceAudio(): BlobShelf {
  shelf ??= blobShelf({
    dbName: "some-ui.scene-voice",
    maxBytes: SCENE_AUDIO_MAX_BYTES,
  })
  return shelf
}

let voice: SceneVoice | null = null

export function phoneSceneVoice(): SceneVoice {
  voice ??= createSceneVoice({
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    audio: sceneVoiceAudio(),
    notes,
    saving: (id, inFlight) => {
      if (inFlight) saving.add(id)
      else saving.delete(id)
    },
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  })
  return voice
}

/**
 * Each half without the other: audio no note names (the app closed between
 * writing it and listing it), and a note whose audio never landed, let go
 * through the runtime so a screen showing the draft sees it go. Best effort,
 * and nothing waits on it.
 */
export function sweepSceneVoice(): void {
  const audio = sceneVoiceAudio()
  audio
    .ids()
    .then(async (stored) => {
      const listed = notes.read().map(({ id }) => id)
      await audio.remove(
        stored.filter((id) => !listed.includes(id) && !saving.has(id))
      )
      const silent = listed.filter((id) => !stored.includes(id))
      if (silent.length > 0) phoneSceneVoice().remove(silent)
    })
    .catch(() => undefined)
}

const SHARE_PORT = "scene voice (share)"

/**
 * The drama's next-scene prompt, as topik's `FileShare` port, with the
 * scene's voice notes it names beside it. A note whose audio cannot be read
 * fails the share, so the prompt never names a file that does not arrive.
 */
export const shareDramaPrompt: FileShare = async ({
  name,
  text,
  notes: named = [],
}) => {
  const failed = (cause: unknown): Awaited<ReturnType<FileShare>> => {
    const error: IntentError = {
      ...toIntentError(cause),
      summary: "A voice note couldn't be read. Let it go and share again.",
    }
    reportFailure({ port: SHARE_PORT, error })
    return { status: "failed", error }
  }
  const audio = sceneVoiceAudio()
  let blobs: Array<Blob | null>
  try {
    blobs = await Promise.all(named.map(({ id }) => audio.get(id)))
  } catch (error) {
    return failed(error)
  }
  const files: Array<SharedFile> = [{ name, data: text }]
  for (const [index, note] of named.entries()) {
    const blob = blobs[index]
    if (!blob) return failed(new Error(`no audio for voice note ${note.id}`))
    files.push({ name: note.name, data: blob })
  }
  return shareFiles("drama-prompt", "The next scene's prompt", files)
}
