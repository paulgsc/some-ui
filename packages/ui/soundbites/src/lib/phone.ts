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

import type { IdeaPorts } from "./idea/runtime"
import { NO_LISTENER } from "./idea/runtime"
import type { ShelfPorts } from "./idea/shelf-runtime"
import { keptIdeaStore } from "./idea/store"
import { SOUNDBITE_BITS_PER_SECOND } from "./policy"
import type { ProjectStore } from "./project/store"
import { indexedDbProjectStore } from "./project/store"
import type { SoundbitesPorts } from "./runtime"
import type { SoundbiteStore } from "./store"
import { indexedDbSoundbiteStore } from "./store"
import type { StudioPorts } from "./studio/runtime"
import { keptTimeLog } from "./studio/time-store"

/** One store per page load, so the database opens once. */
let store: SoundbiteStore | null = null
let projects: ProjectStore | null = null

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

/** Studio's projects: kept in the journal's database, under its takes cap. */
export function phoneProjectStore(): ProjectStore {
  projects ??= indexedDbProjectStore()
  return projects
}

export function phoneStudioPorts(): StudioPorts {
  return {
    store: phoneProjectStore(),
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    player: audioPlayer,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    readText: (file) => file.text(),
    onVisibility: onPageVisibility,
    timeLog: keptTimeLog(),
  }
}

/** Catching an idea; the recognizer is the build's to add (www). */
export function phoneIdeaPorts(): IdeaPorts {
  return {
    store: keptIdeaStore(),
    listener: NO_LISTENER,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
  }
}

/** The idea shelf (ST19): the ideas kept, and the phone's videos. */
export function phoneShelfPorts(): ShelfPorts {
  return {
    ideas: keptIdeaStore(),
    projects: phoneProjectStore(),
    now: () => Date.now(),
    readText: (file) => file.text(),
  }
}
