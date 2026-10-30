/**
 * Where Studio projects live on the phone: the WebView's IndexedDB, in the
 * Build Journal's database (`journal/db.ts`), each project one row and each
 * take's audio beside it under `audioKey`, so no two projects share a key.
 *
 * Each rule holds in the transaction that writes, not in the caller: a save
 * only adds to the project kept (`isAppendOnly`), a take's audio is kept once,
 * only with the project that lists it, never past `JOURNAL_TAKES_MAX_BYTES`
 * counted over the journal's audio and the projects' together,
 * and audio leaves only once home or Drive holds a copy (`letGoRefusal`).
 * Nothing here expires.
 */
import { bytesBesides, done, result, withRoom } from "@some-ui/voice-capture"
import {
  JOURNAL_STORES,
  journalDatabase,
  otherAudioBytes,
} from "@soundbites/lib/journal/db"
import { JOURNAL_TAKES_MAX_BYTES } from "@soundbites/lib/policy"

import type { Project } from "./model"
import { isAppendOnly, letGoRefusal, PROJECT_SCHEMA } from "./model"

export type ProjectStore = {
  read: (id: string) => Promise<Project | null>
  list: () => Promise<Array<Project>>
  audio: (project: string, take: string) => Promise<Blob | null>
  /** Rejects with `ProjectRewriteError`, keeping nothing, unless it only adds. */
  save: (project: Project) => Promise<void>
  /**
   * Saves `project` with take `take`'s audio, in one transaction. Rejects,
   * keeping nothing, with `ProjectFullError` past the cap or the device's
   * room, or `ProjectRewriteError` as `save` does, if `project` lacks the
   * take, or if its audio is already kept.
   */
  keepTake: (project: Project, take: string, audio: Blob) => Promise<void>
  /**
   * Lets take `take`'s audio go from the phone, keeping its record. Rejects
   * with `ProjectUnconfirmedError` until home or Drive holds a copy.
   */
  letGo: (project: string, take: string) => Promise<void>
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

export class ProjectUnconfirmedError extends Error {
  constructor() {
    super("neither home nor Drive has said it holds this take")
    this.name = "ProjectUnconfirmedError"
  }
}

const { projects: PROJECTS, projectAudio: AUDIO } = JOURNAL_STORES

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

/** Puts `project` in place unless it would drop or change what is kept. */
async function putAdding(
  store: IDBObjectStore,
  project: Project
): Promise<void> {
  const kept = await keptIn(store, project.id)
  if (kept !== null && !isAppendOnly(kept, project))
    throw new ProjectRewriteError()
  store.put(project)
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
      await writing([PROJECTS], (tx) =>
        putAdding(tx.objectStore(PROJECTS), project)
      )
    },

    async keepTake(project, take, audio): Promise<void> {
      if (!project.takes.some((each) => each.id === take))
        throw new ProjectRewriteError()
      await withRoom(
        audio.size,
        () =>
          writing([PROJECTS, AUDIO, JOURNAL_STORES.audio], async (tx) => {
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
            await putAdding(tx.objectStore(PROJECTS), project)
            audios.put(audio, key)
          }),
        () => new ProjectFullError()
      )
    },

    async letGo(id, take): Promise<void> {
      await writing([PROJECTS, AUDIO], async (tx) => {
        const projects = tx.objectStore(PROJECTS)
        const kept = await keptIn(projects, id)
        if (kept === null || letGoRefusal(kept, take) !== null)
          throw new ProjectUnconfirmedError()
        projects.put({
          ...kept,
          takes: kept.takes.map((each) =>
            each.id === take ? { ...each, onPhone: false } : each
          ),
        })
        tx.objectStore(AUDIO).delete(audioKey(id, take))
      })
    },
  }
}
