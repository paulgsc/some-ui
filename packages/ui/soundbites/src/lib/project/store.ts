/**
 * Where Studio projects live on the phone: the WebView's IndexedDB, in the
 * Build Journal's database (`journal/db.ts`), each project one row and each
 * take's audio beside it under `audioKey`, so no two projects share a key.
 *
 * Each rule holds in the transaction that writes, not in the caller: a save
 * only adds to the project kept (`isAppendOnly`), a take joins a project only
 * with its audio (`keepTake`), its audio is kept once, never past
 * `JOURNAL_TAKES_MAX_BYTES` counted over the journal's audio and the
 * projects' together, and it leaves only with the save that marks it off the
 * phone, which `isAppendOnly` allows once home or Drive holds a copy.
 * Nothing here expires.
 */
import { bytesBesides, done, result, withRoom } from "@some-ui/voice-capture"
import { carriedProject, isPlan, isTake } from "@soundbites/lib/journal/carry"
import {
  JOURNAL_STORES,
  journalDatabase,
  otherAudioBytes,
} from "@soundbites/lib/journal/db"
import { JOURNAL_TAKES_MAX_BYTES } from "@soundbites/lib/policy"

import type { Project } from "./model"
import { isAppendOnly, PROJECT_SCHEMA } from "./model"

/** How a sitting went, asked as it ends (STUDIO ST4), kept for home (ST9). */
export type Friction = {
  readonly project: string
  readonly sitting: string
  /** ISO 8601, UTC. */
  readonly at: string
  readonly went: "smooth" | "snags" | "rough"
  /** What got in the way, in the person's words or a choice's; null when smooth. */
  readonly gotInTheWay: string | null
}

export type ProjectStore = {
  read: (id: string) => Promise<Project | null>
  list: () => Promise<Array<Project>>
  audio: (project: string, take: string) => Promise<Blob | null>
  /**
   * Rejects with `ProjectRewriteError`, keeping nothing, unless it only adds
   * and adds no take (a take comes with its audio, through `keepTake`). A
   * take it marks off the phone has its audio let go in the same write.
   */
  save: (project: Project) => Promise<void>
  /**
   * Saves `project` with take `take`'s audio, in one transaction. Rejects,
   * keeping nothing, with `ProjectFullError` past the cap or the device's
   * room, or `ProjectRewriteError` as `save` does, if `project` lacks the
   * take, or if its audio is already kept.
   */
  keepTake: (project: Project, take: string, audio: Blob) => Promise<void>
  /**
   * Moves the Journal tab's episode, if one is kept, into a project of its
   * own, audio and all, in one transaction (`journal/carry.ts`); resolves
   * with that project, or null when there was nothing to carry.
   */
  carryJournal: (at: string) => Promise<Project | null>
  /** Keeps how a sitting went, once: a second answer for it is refused. */
  report: (friction: Friction) => Promise<void>
}

export class ProjectFullError extends Error {
  constructor() {
    super("Studio's takes are at their storage cap")
    this.name = "ProjectFullError"
  }
}

export class ProjectRewriteError extends Error {
  constructor() {
    super("the save would change or drop what the project already keeps")
    this.name = "ProjectRewriteError"
  }
}

const {
  projects: PROJECTS,
  projectAudio: AUDIO,
  plan: JOURNAL_PLAN,
  takes: JOURNAL_TAKES,
  audio: JOURNAL_AUDIO,
  friction: FRICTION,
} = JOURNAL_STORES

/** The one key the Journal tab's plan store held. */
const JOURNAL_CURRENT = "current"

/** Where a take's audio is kept: take ids are unique only within a project. */
function audioKey(project: string, take: string): string {
  return `${project}:${take}`
}

/** Only this module writes these stores: a guard against another shape. */
function isProject(row: unknown): row is Project {
  return (
    typeof row === "object" &&
    row !== null &&
    "schema" in row &&
    row.schema === PROJECT_SCHEMA
  )
}

async function keptIn(
  store: IDBObjectStore,
  id: string
): Promise<Project | null> {
  const row: unknown = await result(store.get(id))
  return isProject(row) ? row : null
}

/**
 * Puts `project` in place unless it would drop or change what is kept, or
 * add a take other than `with` (the one whose audio comes in this write),
 * and lets go of the audio of each take it marks off the phone.
 */
async function putAdding(
  tx: IDBTransaction,
  project: Project,
  with_: string | null = null
): Promise<void> {
  const store = tx.objectStore(PROJECTS)
  const kept = await keptIn(store, project.id)
  if (kept !== null && !isAppendOnly(kept, project))
    throw new ProjectRewriteError()
  const before = kept?.takes ?? []
  const added = project.takes.filter(
    (take) => !before.some((each) => each.id === take.id)
  )
  if (added.some((take) => take.id !== with_)) throw new ProjectRewriteError()
  store.put(project)
  const audios = tx.objectStore(AUDIO)
  for (const take of before) {
    const now = project.takes.find((each) => each.id === take.id)
    if (take.onPhone && now?.onPhone === false)
      audios.delete(audioKey(project.id, take.id))
  }
}

export function indexedDbProjectStore(): ProjectStore {
  const connect = journalDatabase()

  /** Runs `write` in a read-write transaction, aborting it on a throw. */
  async function writing(
    stores: ReadonlyArray<string>,
    write: (tx: IDBTransaction) => Promise<void>
  ): Promise<void> {
    const tx = (await connect()).transaction([...stores], "readwrite")
    try {
      await write(tx)
    } catch (error) {
      tx.abort()
      throw error
    }
    await done(tx)
  }

  return {
    async read(id): Promise<Project | null> {
      const tx = (await connect()).transaction(PROJECTS, "readonly")
      return keptIn(tx.objectStore(PROJECTS), id)
    },

    async list(): Promise<Array<Project>> {
      const tx = (await connect()).transaction(PROJECTS, "readonly")
      const rows: Array<unknown> = await result(
        tx.objectStore(PROJECTS).getAll()
      )
      return rows.filter(isProject)
    },

    async audio(project, take): Promise<Blob | null> {
      const tx = (await connect()).transaction(AUDIO, "readonly")
      const blob: unknown = await result(
        tx.objectStore(AUDIO).get(audioKey(project, take))
      )
      return blob instanceof Blob ? blob : null
    },

    async save(project): Promise<void> {
      await writing([PROJECTS, AUDIO], (tx) => putAdding(tx, project))
    },

    async keepTake(project, take, audio): Promise<void> {
      if (!project.takes.some((each) => each.id === take))
        throw new ProjectRewriteError()
      await withRoom(
        audio.size,
        () =>
          writing([PROJECTS, AUDIO, JOURNAL_AUDIO], async (tx) => {
            const audios = tx.objectStore(AUDIO)
            const key = audioKey(project.id, take)
            if ((await result(audios.getKey(key))) !== undefined)
              throw new ProjectRewriteError()
            if (
              (await bytesBesides(audios, key)) +
                (await otherAudioBytes(tx, AUDIO)) +
                audio.size >
              JOURNAL_TAKES_MAX_BYTES
            )
              throw new ProjectFullError()
            await putAdding(tx, project, take)
            audios.put(audio, key)
          }),
        () => new ProjectFullError()
      )
    },

    async carryJournal(at): Promise<Project | null> {
      let carried: Project | null = null
      await writing(
        [PROJECTS, AUDIO, JOURNAL_PLAN, JOURNAL_TAKES, JOURNAL_AUDIO],
        async (tx) => {
          const plan: unknown = await result(
            tx.objectStore(JOURNAL_PLAN).get(JOURNAL_CURRENT)
          )
          if (!isPlan(plan)) return
          const rows: Array<unknown> = await result(
            tx.objectStore(JOURNAL_TAKES).getAll()
          )
          const takes = rows.filter(isTake)
          // A row of a shape this can't read is left where it is, with all
          // the rest: nothing moves until everything can.
          if (takes.length !== rows.length) throw new ProjectRewriteError()
          const { project, audio } = carriedProject(plan, takes, at)
          const projects = tx.objectStore(PROJECTS)
          // Carried before by a write that never cleared: leave both be.
          if ((await keptIn(projects, project.id)) !== null)
            throw new ProjectRewriteError()
          const from = tx.objectStore(JOURNAL_AUDIO)
          const to = tx.objectStore(AUDIO)
          for (const each of audio) {
            const blob: unknown = await result(from.get(each.cutId))
            if (blob instanceof Blob)
              to.put(blob, audioKey(project.id, each.take))
          }
          const kept: Project = {
            ...project,
            // A take whose audio was already gone is carried as off the phone.
            takes: await Promise.all(
              project.takes.map(async (take) => {
                const key = audioKey(project.id, take.id)
                const there = (await result(to.getKey(key))) !== undefined
                return there ? take : { ...take, onPhone: false }
              })
            ),
          }
          projects.put(kept)
          // Only what moved leaves: audio no take named stays where it was.
          for (const each of audio) {
            from.delete(each.cutId)
            tx.objectStore(JOURNAL_TAKES).delete(each.cutId)
          }
          tx.objectStore(JOURNAL_PLAN).delete(JOURNAL_CURRENT)
          carried = kept
        }
      )
      return carried
    },

    async report(friction): Promise<void> {
      await writing([FRICTION], async (tx) => {
        await result(
          tx.objectStore(FRICTION).add({
            id: `${friction.project}:${friction.sitting}`,
            ...friction,
          })
        )
      })
    },
  }
}
