/**
 * The ports as the phone provides them: IndexedDB, the microphone, an
 * `Audio` element, the clock and the page's visibility. The one place the
 * runtime meets the browser's own machines, each wrapped so that what comes
 * back is a result, never a state we then claim to know.
 */
import {
  audioPlayer,
  micRecorder,
  NO_LISTENER,
  onPageVisibility,
} from "@some-ui/voice-capture"

import type { BundlePorts } from "./idea/bundle-runtime"
import { NO_HOME } from "./idea/bundle-runtime"
import { keptDraftStore, keptIdeaLists } from "./idea/draft"
import type { IdeaPorts } from "./idea/runtime"
import type { ShelfPorts } from "./idea/shelf-runtime"
import { keptIdeaStore } from "./idea/store"
import { SOUNDBITE_BITS_PER_SECOND } from "./policy"
import type { StudioNote } from "./project/home"
import {
  letGoDeletedTakes,
  letGoHeldTakes,
  letGoOnDrive,
  notesForHome,
  waitingIds,
} from "./project/home"
import type { LetGoChoice } from "./project/let-go"
import type { Project, Sitting } from "./project/model"
import type { ProjectStore } from "./project/store"
import { indexedDbProjectStore } from "./project/store"
import type { SoundbitesPorts } from "./runtime"
import type { SoundbiteStore } from "./store"
import { indexedDbSoundbiteStore } from "./store"
import { keptLetGo } from "./studio/let-go-store"
import type { StudioPorts } from "./studio/runtime"
import { sittingKey } from "./studio/time-log"
import type { TimeEvent } from "./studio/time-log"
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
    letGo: keptLetGo(),
  }
}

/** Answering Claude's questions about an idea; the recognizer is the build's to add (www). */
export function phoneIdeaPorts(): IdeaPorts {
  return {
    store: keptIdeaStore(),
    listener: NO_LISTENER,
    now: () => Date.now(),
    onVisibility: onPageVisibility,
  }
}

/**
 * A new idea (ST26), but for its takes, which the build hands in (www's
 * `lib/idea-takes`), and home, which it may.
 */
export function phoneBundlePorts(): Omit<BundlePorts, "takes"> {
  return {
    drafts: keptDraftStore(),
    ideas: keptIdeaStore(),
    lists: () => keptIdeaLists().read(),
    home: NO_HOME,
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

/** What the home link's lanes need of Studio, handed in by a Studio screen. */
export type StudioKeeping = {
  /** What the lanes read of Studio's projects. */
  readonly store: Pick<
    ProjectStore,
    "list" | "audio" | "friction" | "subscribe"
  >
  /** The time log as kept on the phone. */
  readonly timeLog: () => ReadonlyArray<TimeEvent>
  readonly notesForHome: (
    projects: ReadonlyArray<Project>
  ) => ReadonlyArray<StudioNote>
  /**
   * Marks each take home holds (`held`) as kept there, and lets the audio of
   * each the owner's choice allows leave the phone (HF11, LG1).
   */
  readonly letGoHeldTakes: (held: ReadonlySet<string>) => Promise<number>
  /**
   * Lets the audio of each take home deleted for good leave the phone, on
   * home's receipt alone (MY-DATA MD3).
   */
  readonly letGoDeletedTakes: (deleted: ReadonlySet<string>) => Promise<number>
  /** The owner's choice of when a take home holds leaves the phone, as kept. */
  readonly letGo: () => LetGoChoice
  /** The ids of the takes home holds that are still on the phone. */
  readonly waitingIds: (
    projects: ReadonlyArray<Project>
  ) => ReadonlyArray<string>
  /**
   * Lets go each take home holds and says Drive has too (`onDrive`), as the
   * owner's choice allows (HF11, LG1).
   */
  readonly letGoOnDrive: (onDrive: ReadonlySet<string>) => Promise<number>
  readonly sittingKey: (sitting: Sitting) => string
}

/**
 * Studio's pieces as the phone keeps them, for a Studio screen to hand to
 * the home link: Studio itself, and Ideas on home, whose Delete… needs
 * Studio's store handed in for My data to let the phone's copy go.
 */
export function phoneStudioKeeping(): StudioKeeping {
  const store = phoneProjectStore()
  return {
    store,
    timeLog: () => keptTimeLog().read(),
    notesForHome,
    // As the owner chose, read at each let-go (HF11, LG1): none before.
    letGoHeldTakes: (held) => letGoHeldTakes(store, held, keptLetGo().read()),
    // Home's receipt for a take My data deleted (MD3): whatever the choice.
    letGoDeletedTakes: (deleted) => letGoDeletedTakes(store, deleted),
    letGo: () => keptLetGo().read(),
    waitingIds,
    // Home's word that Drive has a take too (HF11), as the owner chose.
    letGoOnDrive: (onDrive) => letGoOnDrive(store, onDrive, keptLetGo().read()),
    sittingKey,
  }
}
