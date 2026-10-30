/**
 * Where Studio projects live on the phone: the WebView's IndexedDB, in the
 * Build Journal's database (`journal/db.ts`), each project one row and each
 * take's audio beside it under `audioKey`, so no two projects share a key.
 *
 * **A write is an operation on what the store holds now.** `update` reads the
 * project inside its own transaction, hands it to the caller's pure `change`
 * (the model's `step`, through the Studio's queued operations), checks the
 * result with `admitted` and writes it there, so no write is ever built on a
 * copy a screen read earlier. Append-only operations can't conflict, so
 * nothing is retried.
 *
 * Each rule holds in that transaction: a save only adds (`isAppendOnly`), a
 * take joins a project only with its audio, in the same write, its audio is
 * kept once and never past `JOURNAL_TAKES_MAX_BYTES` over the projects'
 * audio and what the Journal tab's stores still hold, and audio leaves only
 * with the write that marks its take off the phone, which `isAppendOnly`
 * allows once home or Drive holds a copy. Nothing here expires.
 */
import { bytesBesides, done, result, withRoom } from "@some-ui/voice-capture"
import type { Row } from "@soundbites/lib/journal/carry"
import { letGo, planCarry } from "@soundbites/lib/journal/carry"
import {
  projectAudioKey as audioKey,
  JOURNAL_STORES,
  journalDatabase,
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
 * What carrying the Journal tab's episode did: no episode to carry; carried,
 * with how many takes came without a recording (gone before the carry); an
 * episode whose plan it couldn't read; or one it can read but not carry,
 * left untouched. All but that last say how many rows of the Journal tab's
 * stores it didn't use and let go (`cleared`), emptying them (owner,
 * 2026-10-30, #2251).
 */
export type Carried =
  | { readonly kind: "nothing"; readonly cleared: number }
  | {
      readonly kind: "carried"
      readonly project: Project
      readonly cleared: number
      readonly gone: number
    }
  | { readonly kind: "unread"; readonly cleared: number }
  | { readonly kind: "stays" }

/**
 * An operation on a project as the store holds it (null when it isn't kept
 * yet): the project it makes, or null to change nothing. Pure: the store
 * runs it inside the transaction that writes.
 */
export type Change = (held: Project | null) => Project | null

/** What a write found: the project as kept after it, and whether it changed. */
export type Written = {
  /** The project as held before the write. */
  readonly before: Project | null
  readonly project: Project | null
  readonly changed: boolean
}

/** A notice `remember` kept, under the key `forget` lets it go by. */
export type StoredNotice = { readonly key: number; readonly text: string }

export type ProjectStore = {
  read: (id: string) => Promise<Project | null>
  list: () => Promise<Array<Project>>
  audio: (project: string, take: string) => Promise<Blob | null>
  /**
   * The bytes of audio the projects may still keep under the cap, which
   * counts what the Journal tab's stores still hold too.
   */
  room: () => Promise<number>
  /**
   * Applies `change` to project `id` as held, in one transaction, with
   * `audio` (the one take the change adds) kept in the same write. Rejects,
   * keeping nothing, with `ProjectFullError` past the cap or the device's
   * room, or `ProjectRewriteError` if the change would drop or rewrite what
   * is kept or add a take without its audio: a fault in the change, never a
   * race, since it reads what is held.
   */
  update: (
    id: string,
    change: Change,
    audio?: { readonly take: string; readonly blob: Blob }
  ) => Promise<Written>
  /**
   * Moves the Journal tab's episode, if one is kept, into a project of its
   * own, audio and all, in one transaction, as `planCarry` decides
   * (`journal/carry.ts`), and in the same transaction lets go of every row
   * of the Journal tab's stores it didn't move, unless the episode stays.
   */
  carryJournal: (at: string) => Promise<Carried>
  /** Keeps how a sitting went, once: a second answer for it is refused. */
  report: (friction: Friction) => Promise<void>
  /** Keeps what a screen that had gone away couldn't keep, for the next to say. */
  remember: (notice: string) => Promise<void>
  /** What `remember` kept, oldest first; reading lets none of it go. */
  notices: () => Promise<Array<StoredNotice>>
  /** Lets go of the notices under `keys`, once a screen has shown them. */
  forget: (keys: ReadonlyArray<number>) => Promise<void>
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
    super("the write would change or drop what the project already keeps")
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
  notices: NOTICES,
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

/** The bytes of every recording in `store`, in the caller's transaction. */
async function blobBytes(store: IDBObjectStore): Promise<number> {
  const kept: Array<unknown> = await result(store.getAll())
  return kept.reduce<number>(
    (sum, each) => (each instanceof Blob ? sum + each.size : sum),
    0
  )
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

  /**
   * Runs `write` in a read-write transaction, aborting it on a throw. A
   * write that says it changed nothing (`false`) tells no one.
   */
  async function writing(
    stores: ReadonlyArray<string>,
    write: (tx: IDBTransaction) => Promise<boolean | void>
  ): Promise<void> {
    const tx = (await connect()).transaction([...stores], "readwrite")
    let wrote: boolean | void
    try {
      wrote = await write(tx)
    } catch (error) {
      tx.abort()
      throw error
    }
    await done(tx)
    if (wrote !== false) changed()
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

    async room(): Promise<number> {
      const tx = (await connect()).transaction(
        [AUDIO, JOURNAL_AUDIO],
        "readonly"
      )
      const used =
        (await blobBytes(tx.objectStore(AUDIO))) +
        (await blobBytes(tx.objectStore(JOURNAL_AUDIO)))
      return Math.max(0, JOURNAL_TAKES_MAX_BYTES - used)
    },

    async update(id, change, audio): Promise<Written> {
      let written: Written = { before: null, project: null, changed: false }
      const write = (): Promise<void> =>
        writing([PROJECTS, AUDIO, JOURNAL_AUDIO], async (tx) => {
          const projects = tx.objectStore(PROJECTS)
          const held = await keptIn(projects, id)
          const next = change(held)
          if (next === null) {
            written = { before: held, project: held, changed: false }
            return false
          }
          const admission = admitted(held, next, audio?.take ?? null)
          if (!admission.ok || next.id !== id) throw new ProjectRewriteError()
          const audios = tx.objectStore(AUDIO)
          if (audio !== undefined) {
            const key = audioKey(id, audio.take)
            if (
              !next.takes.some((take) => take.id === audio.take) ||
              (await result(audios.getKey(key))) !== undefined
            )
              throw new ProjectRewriteError()
            if (
              (await bytesBesides(audios, key)) +
                (await blobBytes(tx.objectStore(JOURNAL_AUDIO))) +
                audio.blob.size >
              JOURNAL_TAKES_MAX_BYTES
            )
              throw new ProjectFullError()
            audios.put(audio.blob, key)
          }
          projects.put(next)
          for (const take of admission.letGo) audios.delete(audioKey(id, take))
          written = { before: held, project: next, changed: true }
          return true
        })
      await (audio === undefined
        ? write()
        : withRoom(audio.blob.size, write, () => new ProjectFullError()))
      return written
    },

    async carryJournal(at): Promise<Carried> {
      let carried: Carried = { kind: "nothing", cleared: 0 }
      await writing(
        [PROJECTS, AUDIO, JOURNAL_PLAN, JOURNAL_TAKES, JOURNAL_AUDIO],
        async (tx) => {
          const plans = tx.objectStore(JOURNAL_PLAN)
          const takes = tx.objectStore(JOURNAL_TAKES)
          const audio = tx.objectStore(JOURNAL_AUDIO)
          const rows = {
            plan: await result(plans.get(JOURNAL_CURRENT)),
            takes: await rowsOf(takes),
            audio: await rowsOf(audio),
          }
          const planRows = await result(plans.count())
          const held = planRows + rows.takes.length + rows.audio.length
          if (held === 0) return false
          const plan = planCarry(
            {
              ...rows,
              projects: await result(tx.objectStore(PROJECTS).getAllKeys()),
            },
            at
          )
          if (plan.kind === "stays") {
            carried = plan
            return false
          }
          const cleared = letGo(plan, held)
          if (plan.kind === "carry") {
            tx.objectStore(PROJECTS).put(plan.project)
            const to = tx.objectStore(AUDIO)
            for (const each of plan.moves) to.put(each.audio, each.to)
            carried = {
              kind: "carried",
              project: plan.project,
              cleared,
              gone: plan.gone,
            }
          } else {
            carried = { kind: plan.kind, cleared }
          }
          // What wasn't moved is let go with the rest (owner, 2026-10-30,
          // #2251): nothing writes these stores any more.
          for (const store of [plans, takes, audio]) store.clear()
          return true
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

    async remember(notice): Promise<void> {
      await writing([NOTICES], async (tx) => {
        await result(tx.objectStore(NOTICES).add(notice))
      })
    },

    async notices(): Promise<Array<StoredNotice>> {
      const tx = (await connect()).transaction(NOTICES, "readonly")
      const rows = await rowsOf(tx.objectStore(NOTICES))
      return rows.flatMap((row) =>
        typeof row.key === "number" && typeof row.value === "string"
          ? [{ key: row.key, text: row.value }]
          : []
      )
    },

    async forget(keys): Promise<void> {
      await writing([NOTICES], (tx) => {
        const store = tx.objectStore(NOTICES)
        for (const key of keys) store.delete(key)
        // A screen let go of what it showed: nothing for another to read.
        return Promise.resolve(false)
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
