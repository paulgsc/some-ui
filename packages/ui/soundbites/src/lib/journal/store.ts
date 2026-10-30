/**
 * Where an episode's primer and takes live: the WebView's IndexedDB, on the
 * phone, in a database of their own, apart from the study soundbites and
 * their six places. One plan at a time, one take per cut (a redo replaces
 * it), and the audio beside each take under its cut's id.
 *
 * Each rule holds in the transaction that writes, not in the caller: a write
 * about an episode names it (`openedAt`) and touches nothing of another, a
 * take is kept only for a cut of the plan in place, and never past
 * `JOURNAL_TAKES_MAX_BYTES`.
 */
import {
  bytesBesides,
  bytesOf,
  connection,
  done,
  result,
  withRoom,
} from "@some-ui/voice-capture"
import type { Cut, Primer } from "@soundbites/lib/journal/primer"
import { cutV1 } from "@soundbites/lib/journal/primer"
import { JOURNAL_TAKES_MAX_BYTES } from "@soundbites/lib/policy"
import { askToKeep } from "@soundbites/lib/store"

import type { JournalPlan, JournalTake } from "./plan"
import { inCutOrder } from "./plan"

export type JournalShelf = {
  readonly plan: JournalPlan | null
  /** The plan's, in its cut order (`inCutOrder`). */
  readonly takes: ReadonlyArray<JournalTake>
}

/** What a share sent: the episode it came from and the takes it carried. */
export type JournalSent = {
  readonly openedAt: JournalPlan["openedAt"]
  readonly takes: ReadonlyArray<JournalTake>
}

/** The episode as one transaction saw it: each take with its own audio. */
export type JournalSnapshot = {
  readonly plan: JournalPlan | null
  /** The plan's takes with audio, in its cut order. */
  readonly takes: ReadonlyArray<{
    readonly take: JournalTake
    readonly audio: Blob
  }>
}

export type JournalStore = {
  read: () => Promise<JournalShelf>
  /**
   * The plan, its takes and their audio, read in one transaction, so no
   * write can land between a take and its audio (what a share sends).
   */
  snapshot: () => Promise<JournalSnapshot>
  audio: (cutId: string) => Promise<Blob | null>
  /**
   * Puts `plan` in place of any other, keeping the takes for cuts it still
   * has and letting go of the rest.
   */
  open: (plan: JournalPlan) => Promise<void>
  /** Rejects with `JournalStaleError`, keeping nothing, unless `episode` is in place. */
  setTargets: (
    targets: JournalPlan["targets"],
    episode: string
  ) => Promise<void>
  /**
   * Keeps `take` with its audio in place of its cut's last one. Rejects,
   * keeping nothing, with `JournalFullError` past the cap or the device's
   * room, or
   * `JournalStaleError` unless `episode` is in place and has the cut.
   */
  saveTake: (take: JournalTake, audio: Blob, episode: string) => Promise<void>
  /** Lets the plan and every take go, if `episode` is the one in place. */
  clear: (episode: string) => Promise<void>
  /**
   * If the episode `sent` came from is still in place, lets go of the takes
   * it carried that are still as they were sent (same cut, same
   * `recordedAt`), and of the plan once no take is left. A take recorded or
   * redone since stays; with another primer in place, nothing goes.
   */
  letGo: (sent: JournalSent) => Promise<void>
  /**
   * Calls `listener` after each write commits, on this page, so a page
   * showing the shelf can re-read it. Returns an unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
}

export class JournalFullError extends Error {
  constructor() {
    super("the journal's takes are at their storage cap")
    this.name = "JournalFullError"
  }
}

export class JournalStaleError extends Error {
  constructor() {
    super("the take's cut is not in the plan in place")
    this.name = "JournalStaleError"
  }
}

const DB_NAME = "some-ui.journal"
const DB_VERSION = 1
const PLAN = "plan"
const TAKES = "takes"
const AUDIO = "audio"
/** The one key `PLAN` holds. */
const CURRENT = "current"

/** A plan as kept: one from before primer version 2 has cuts with only a prompt. */
type KeptPlan = Omit<JournalPlan, "primer"> & {
  readonly primer: Omit<Primer, "voice" | "cuts"> & {
    readonly voice?: Primer["voice"]
    readonly cuts: ReadonlyArray<Cut | Parameters<typeof cutV1>[0]>
  }
}

/** Only this module writes these stores: a guard against an older shape. */
function isPlan(row: unknown): row is KeptPlan {
  return (
    typeof row === "object" &&
    row !== null &&
    "primer" in row &&
    typeof row.primer === "object" &&
    row.primer !== null &&
    "cuts" in row.primer &&
    Array.isArray(row.primer.cuts) &&
    "targets" in row &&
    typeof row.targets === "object" &&
    "touchedAt" in row &&
    typeof row.touchedAt === "string"
  )
}

function isTake(row: unknown): row is JournalTake {
  return (
    typeof row === "object" &&
    row !== null &&
    "cutId" in row &&
    typeof row.cutId === "string" &&
    "durationMs" in row &&
    typeof row.durationMs === "number"
  )
}

/**
 * A plan kept before primer version 2 holds cuts with only a prompt and no
 * voice: they read as the version 1 cuts they were.
 */
export function upgraded(plan: KeptPlan): JournalPlan {
  return {
    ...plan,
    primer: {
      ...plan.primer,
      voice: plan.primer.voice ?? "read",
      cuts: plan.primer.cuts.map((cut) => ("voice" in cut ? cut : cutV1(cut))),
    },
  }
}

async function planIn(store: IDBObjectStore): Promise<JournalPlan | null> {
  const row: unknown = await result(store.get(CURRENT))
  return isPlan(row) ? upgraded(row) : null
}

export function indexedDbJournalStore(): JournalStore {
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  const connect = connection(
    DB_NAME,
    DB_VERSION,
    (db) => {
      if (!db.objectStoreNames.contains(PLAN)) db.createObjectStore(PLAN)
      if (!db.objectStoreNames.contains(TAKES))
        db.createObjectStore(TAKES, { keyPath: "cutId" })
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO)
    },
    askToKeep
  )

  return {
    async read(): Promise<JournalShelf> {
      const tx = (await connect()).transaction([PLAN, TAKES], "readonly")
      const plan = await planIn(tx.objectStore(PLAN))
      const rows: Array<unknown> = await result(tx.objectStore(TAKES).getAll())
      const takes = rows.filter(isTake)
      return { plan, takes: plan === null ? [] : inCutOrder(plan, takes) }
    },

    async snapshot(): Promise<JournalSnapshot> {
      const tx = (await connect()).transaction([PLAN, TAKES, AUDIO], "readonly")
      const plan = await planIn(tx.objectStore(PLAN))
      if (plan === null) return { plan, takes: [] }
      const rows: Array<unknown> = await result(tx.objectStore(TAKES).getAll())
      const audios = tx.objectStore(AUDIO)
      const takes = await Promise.all(
        inCutOrder(plan, rows.filter(isTake)).map(async (take) => {
          const blob: unknown = await result(audios.get(take.cutId))
          return { take, audio: blob instanceof Blob ? blob : null }
        })
      )
      return {
        plan,
        takes: takes.filter(
          (each): each is { take: JournalTake; audio: Blob } =>
            each.audio !== null
        ),
      }
    },

    async audio(cutId): Promise<Blob | null> {
      const tx = (await connect()).transaction(AUDIO, "readonly")
      const blob: unknown = await result(tx.objectStore(AUDIO).get(cutId))
      return blob instanceof Blob ? blob : null
    },

    async open(plan): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
      const takes = tx.objectStore(TAKES)
      const kept: Array<IDBValidKey> = await result(takes.getAllKeys())
      for (const cutId of kept) {
        if (plan.primer.cuts.some((cut) => cut.id === cutId)) continue
        takes.delete(cutId)
        tx.objectStore(AUDIO).delete(cutId)
      }
      tx.objectStore(PLAN).put(plan, CURRENT)
      await done(tx)
      changed()
    },

    async setTargets(targets, episode): Promise<void> {
      const tx = (await connect()).transaction(PLAN, "readwrite")
      const store = tx.objectStore(PLAN)
      const plan = await planIn(store)
      if (plan?.openedAt !== episode) {
        tx.abort()
        throw new JournalStaleError()
      }
      store.put({ ...plan, targets }, CURRENT)
      await done(tx)
      changed()
    },

    async saveTake(take, audio, episode): Promise<void> {
      const db = await connect()
      const freed = await bytesOf(db, AUDIO, [take.cutId])
      await withRoom(
        audio.size - freed,
        async (claim): Promise<void> => {
          const tx = db.transaction([PLAN, TAKES, AUDIO], "readwrite")
          const audios = tx.objectStore(AUDIO)
          const replaced: unknown = await result(audios.get(take.cutId))
          const frees = replaced instanceof Blob ? replaced.size : 0
          const plan = await planIn(tx.objectStore(PLAN))
          if (
            plan?.openedAt !== episode ||
            !plan.primer.cuts.some((cut) => cut.id === take.cutId)
          ) {
            tx.abort()
            throw new JournalStaleError()
          }
          if (
            audio.size - frees > claim ||
            (await bytesBesides(audios, take.cutId)) + audio.size >
              JOURNAL_TAKES_MAX_BYTES
          ) {
            tx.abort()
            throw new JournalFullError()
          }
          tx.objectStore(TAKES).put(take)
          audios.put(audio, take.cutId)
          tx.objectStore(PLAN).put(
            { ...plan, touchedAt: take.recordedAt },
            CURRENT
          )
          await done(tx)
        },
        () => new JournalFullError()
      )
      changed()
    },

    async clear(episode): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
      const plan = await planIn(tx.objectStore(PLAN))
      if (plan?.openedAt !== episode) {
        // Another episode opened since this one was read: it stays.
        tx.abort()
        return
      }
      tx.objectStore(PLAN).clear()
      tx.objectStore(TAKES).clear()
      tx.objectStore(AUDIO).clear()
      await done(tx)
      changed()
    },

    async letGo(sent): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
      const plan = await planIn(tx.objectStore(PLAN))
      if (plan?.openedAt !== sent.openedAt) {
        // Another episode is in place: what it kept is its own now.
        tx.abort()
        return
      }
      const takes = tx.objectStore(TAKES)
      const rows: Array<unknown> = await result(takes.getAll())
      const left = rows
        .filter(isTake)
        .filter(
          (row) =>
            !sent.takes.some(
              (each) =>
                each.cutId === row.cutId && each.recordedAt === row.recordedAt
            )
        )
      for (const each of sent.takes) {
        if (left.some((row) => row.cutId === each.cutId)) continue
        takes.delete(each.cutId)
        tx.objectStore(AUDIO).delete(each.cutId)
      }
      if (left.length === 0) tx.objectStore(PLAN).clear()
      await done(tx)
      changed()
    },

    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}
