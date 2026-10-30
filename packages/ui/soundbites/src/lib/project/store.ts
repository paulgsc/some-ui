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
import type { Row } from "@soundbites/lib/journal/carry"
import { planCarry } from "@soundbites/lib/journal/carry"
import {
  projectAudioKey as audioKey,
  JOURNAL_STORES,
  journalDatabase,
  otherAudioBytes,
} from "@soundbites/lib/journal/db"
import { JOURNAL_TAKES_MAX_BYTES } from "@soundbites/lib/policy"

import type { Project } from "./model"
import { admitted, PROJECT_SCHEMA } from "./model"

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

/**
 * What carrying the Journal tab's episode did: nothing to carry; carried,
 * with how many rows it couldn't read or copy and left where they were; or
 * kept where it is, untouched, since it can't be carried.
 */
export type Carried =
  | { readonly kind: "nothing" }
  | {
      readonly kind: "carried"
      readonly project: Project
      readonly left: number
    }
  | { readonly kind: "stays" }

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
   * own, audio and all, in one transaction, as `planCarry` decides
   * (`journal/carry.ts`).
   */
  carryJournal: (at: string) => Promise<Carried>
  /** Keeps how a sitting went, once: a second answer for it is refused. */
  report: (friction: Friction) => Promise<void>
  /**
   * Calls `listener` after each write commits, on this page, so a screen
   * showing a project (another runtime's, say) can read it again. Returns
   * an unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
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
 * Puts `project` in place as `admitted` allows (only adding, and adding no
 * take but `adding`, whose audio comes in this write), and lets go of the
 * audio of each take it marks off the phone.
 */
async function putAdding(
  tx: IDBTransaction,
  project: Project,
  adding: string | null = null
): Promise<void> {
  const store = tx.objectStore(PROJECTS)
  const admission = admitted(await keptIn(store, project.id), project, adding)
  if (!admission.ok) throw new ProjectRewriteError()
  store.put(project)
  const audios = tx.objectStore(AUDIO)
  for (const take of admission.letGo) audios.delete(audioKey(project.id, take))
}

/** Every row of `store`, each with its key, in the caller's transaction. */
async function rowsOf(store: IDBObjectStore): Promise<Array<Row>> {
  const keys = await result(store.getAllKeys())
  const values: Array<unknown> = await result(store.getAll())
  return keys.map((key, index) => ({ key, value: values[index] }))
}

export function indexedDbProjectStore(): ProjectStore {
  const connect = journalDatabase()
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }

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
    changed()
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

    async carryJournal(at): Promise<Carried> {
      let carried: Carried = { kind: "nothing" }
      await writing(
        [PROJECTS, AUDIO, JOURNAL_PLAN, JOURNAL_TAKES, JOURNAL_AUDIO],
        async (tx) => {
          const plan = planCarry(
            {
              plan: await result(
                tx.objectStore(JOURNAL_PLAN).get(JOURNAL_CURRENT)
              ),
              takes: await rowsOf(tx.objectStore(JOURNAL_TAKES)),
              audio: await rowsOf(tx.objectStore(JOURNAL_AUDIO)),
              projects: await result(tx.objectStore(PROJECTS).getAllKeys()),
            },
            at
          )
          if (plan.kind !== "carry") {
            carried = plan
            return
          }
          // Only what the plan copied leaves; everything else stays put.
          tx.objectStore(PROJECTS).put(plan.project)
          const to = tx.objectStore(AUDIO)
          for (const each of plan.moves) to.put(each.audio, each.to)
          const from = tx.objectStore(JOURNAL_AUDIO)
          for (const key of plan.audioRows) from.delete(key)
          const takes = tx.objectStore(JOURNAL_TAKES)
          for (const key of plan.takeRows) takes.delete(key)
          tx.objectStore(JOURNAL_PLAN).delete(JOURNAL_CURRENT)
          carried = { kind: "carried", project: plan.project, left: plan.left }
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

    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}
