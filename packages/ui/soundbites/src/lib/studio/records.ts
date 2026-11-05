/**
 * What Studio keeps (MY-DATA MD4, #2478): each project's takes, every one
 * of them (the chosen and the earlier), each as the take pattern's row
 * draws it: playable while its audio is on this phone, where it is kept and
 * since when, and Delete… on a take home marks deletable, which opens My
 * data on it (`records: "delete-in-my-data"`). Nothing here deletes: My
 * data's sheet does, once it opens on the take (MD3).
 *
 * `recordsView` is pure; `createStudioRecords` reads the projects and what
 * home marks deletable over ports, asking home one ask at a time, and plays
 * one take at a time; which late answer is stale is decided here, by
 * numbering each read and each play.
 */
import type {
  PatternTake,
  Player,
  TakePatternOptions,
  TakeRowView,
} from "@some-ui/voice-capture"
import { deletesInMyData } from "@some-ui/voice-capture"
import { isPaired } from "@soundbites/lib/idea/bundle"
import type { IdeaHome } from "@soundbites/lib/idea/bundle-runtime"
import { NO_HOME } from "@soundbites/lib/idea/bundle-runtime"
import type { Project, ProjectTake } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import type { ProjectStore } from "@soundbites/lib/project/store"

import { patternTakeOf } from "./view"

/** The take pattern's options for a record's row here. */
const RECORDS: Pick<TakePatternOptions, "records"> = {
  records: "delete-in-my-data",
}

/** One project's takes, newest first. */
export type ProjectRecords = {
  readonly project: string
  readonly title: string
  readonly rows: ReadonlyArray<TakeRowView>
}

type RecordsState = {
  /** Null until read; `unreadable` when the projects couldn't be. */
  readonly projects: ReadonlyArray<Project> | "unreadable" | null
  /** The takes home marks deletable, as last read; empty until then. */
  readonly deletable: ReadonlySet<string>
  /** The take being read or playing, if one is. */
  readonly playing: string | null
  /** Whether this phone is paired with home, as the home port last said (ST34). */
  readonly paired: boolean
}

function patternTake(
  take: ProjectTake,
  deletable: ReadonlySet<string>,
  paired: boolean
): PatternTake {
  return {
    ...patternTakeOf(take, paired),
    ...(deletable.has(take.id) ? { deletable: true } : {}),
  }
}

/** Each project with takes, its takes as rows, newest first. */
export function recordsView(
  projects: ReadonlyArray<Project>,
  deletable: ReadonlySet<string>,
  playing: string | null,
  paired: boolean
): ReadonlyArray<ProjectRecords> {
  return projects.flatMap((project) => {
    if (project.takes.length === 0) return []
    const rows = [...project.takes]
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .map((take): TakeRowView => {
        const row = patternTake(take, deletable, paired)
        return {
          take: row,
          playing: playing === take.id,
          canPlay: take.onPhone && take.deletedAt === undefined,
          canRedo: false,
          canLetGo: false,
          unsent: false,
          canDelete: deletesInMyData(RECORDS, row),
        }
      })
    return [{ project: project.id, title: latest(project).cutList.title, rows }]
  })
}

export type RecordsPorts = {
  readonly store: Pick<ProjectStore, "list" | "audio" | "subscribe">
  /** The takes home marks deletable; never rejects (none, when it can't say). */
  readonly deletable: () => Promise<ReadonlySet<string>>
  readonly player: Player
  /** Home, for whether this phone is paired (ST34); never paired without one. */
  readonly home?: IdeaHome
}

export type StudioRecords = {
  readonly getSnapshot: () => RecordsState
  readonly subscribe: (listener: () => void) => () => void
  /** Plays take `id` of `project`, or stops it while it plays. */
  readonly play: (project: string, id: string) => void
  /** The screen is showing: reads, and reads again on each write. */
  readonly attach: () => () => void
}

const INITIAL: RecordsState = {
  projects: null,
  deletable: new Set(),
  playing: null,
  paired: false,
}

export function createStudioRecords(ports: RecordsPorts): StudioRecords {
  let state = INITIAL
  let reads = 0
  let attachments = 0
  let asking = false
  let askAgain = false
  let plays = 0
  let stopPlaying: (() => void) | null = null
  const listeners = new Set<() => void>()

  const set = (next: RecordsState): void => {
    state = next
    for (const listener of listeners) listener()
  }

  const read = (): void => {
    reads += 1
    const seq = reads
    ports.store.list().then(
      (projects) => {
        if (seq === reads) set({ ...state, projects })
      },
      () => {
        if (seq === reads) set({ ...state, projects: "unreadable" })
      }
    )
    askDeletable()
  }

  /**
   * One ask of what home marks deletable at a time: a write while one is
   * out asks once more after it lands, however many writes there were, so
   * a run of writes (a lane letting takes go) is not a run of asks.
   */
  const askDeletable = (): void => {
    if (asking) {
      askAgain = true
      return
    }
    asking = true
    const at = attachments
    void ports.deletable().then((deletable) => {
      asking = false
      if (at === attachments) set({ ...state, deletable })
      if (askAgain) {
        askAgain = false
        askDeletable()
      }
    })
  }

  const stop = (): void => {
    plays += 1
    stopPlaying?.()
    stopPlaying = null
    if (state.playing !== null) set({ ...state, playing: null })
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    play(project, id): void {
      const again = state.playing === id
      stop()
      if (again) return
      const seq = plays
      set({ ...state, playing: id })
      ports.store.audio(project, id).then(
        (audio) => {
          if (seq !== plays) return
          if (audio === null) {
            set({ ...state, playing: null })
            return
          }
          const started = ports.player.play(audio)
          stopPlaying = started.stop
          void started.ended.then(() => {
            if (seq !== plays) return
            stopPlaying = null
            set({ ...state, playing: null })
          })
        },
        () => {
          if (seq === plays) set({ ...state, playing: null })
        }
      )
    },
    attach(): () => void {
      read()
      const unsubscribe = ports.store.subscribe(read)
      const home = ports.home ?? NO_HOME
      const tellPaired = (): void => {
        const paired = isPaired(home.reach())
        if (paired !== state.paired) set({ ...state, paired })
      }
      const unwatchHome = home.subscribe(tellPaired)
      tellPaired()
      return (): void => {
        unsubscribe()
        unwatchHome()
        stop()
        reads += 1
        attachments += 1
        askAgain = false
      }
    },
  }
}
