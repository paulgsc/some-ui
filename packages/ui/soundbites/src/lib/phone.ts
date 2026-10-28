/**
 * The ports as the phone provides them: IndexedDB, the microphone, an
 * `Audio` element, the clock and the page's visibility. The one place the
 * runtime meets the browser's own machines, each wrapped so that what comes
 * back is a result, never a state we then claim to know.
 */
import {
  audioPlayer,
  micRecorder,
  onPageVisibility,
} from "@some-ui/voice-capture"

import type { JournalPorts } from "./journal/runtime"
import type { JournalStore } from "./journal/store"
import { indexedDbJournalStore } from "./journal/store"
import { SOUNDBITE_BITS_PER_SECOND } from "./policy"
import type { SoundbitesPorts } from "./runtime"
import type { SoundbiteStore } from "./store"
import { indexedDbSoundbiteStore } from "./store"

/** One store per page load, so the database opens once. */
let store: SoundbiteStore | null = null
let journal: JournalStore | null = null

export function phoneSoundbiteStore(): SoundbiteStore {
  store ??= indexedDbSoundbiteStore()
  return store
}

export function phonePorts(): SoundbitesPorts {
  return {
    store: phoneSoundbiteStore(),
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    player: audioPlayer,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
  }
}

/** The journal's store: its own database, apart from the soundbites. */
export function phoneJournalStore(): JournalStore {
  journal ??= indexedDbJournalStore()
  return journal
}

export function phoneJournalPorts(): JournalPorts {
  return {
    store: phoneJournalStore(),
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    player: audioPlayer,
    now: () => Date.now(),
    readText: (file) => file.text(),
    onVisibility: onPageVisibility,
  }
}
