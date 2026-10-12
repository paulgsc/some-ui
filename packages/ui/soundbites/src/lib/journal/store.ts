/**
 * Where an episode's primer and takes live: the WebView's IndexedDB, on the
 * phone, in a database of their own, apart from the study soundbites and
 * their six places. One plan at a time, one take per cut (a redo replaces
 * it), and the audio beside each take under its cut's id.
 *
 * Each rule holds in the transaction that writes, not in the caller: a take
 * is kept only for a cut of the plan in place, and never past
 * `JOURNAL_TAKES_MAX_BYTES`.
 */
import { bytesBesides, connection, done, result } from "@some-ui/voice-capture"
import { askToKeep } from "@soundbites/lib/store"

import type { JournalPlan, JournalTake } from "./plan"
import { inCutOrder, JOURNAL_TAKES_MAX_BYTES } from "./plan"

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

export type JournalStore = {
  read: () => Promise<JournalShelf>
  audio: (cutId: string) => Promise<Blob | null>
  /** Puts `plan` in place of any other, letting go of the takes `drop` names. */
  open: (plan: JournalPlan, drop: ReadonlyArray<string>) => Promise<void>
  /** Rejects, keeping nothing, with no plan in place. */
  setTargets: (targets: JournalPlan["targets"]) => Promise<void>
  /**
   * Keeps `take` with its audio in place of its cut's last one. Rejects,
   * keeping nothing, with `JournalFullError` past the cap or
   * `JournalStaleError` when the plan in place has no such cut.
   */
  saveTake: (take: JournalTake, audio: Blob) => Promise<void>
  /** Lets the plan and every take go. */
  clear: () => Promise<void>
  /**
   * Lets go of the takes `sent` carried that are still as they were sent
   * (same cut, same `recordedAt`), and of the plan once no take is left, if
   * it is still the episode sent. A take recorded or redone since, or a
   * primer opened since, stays.
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

/** Only this module writes these stores: a guard against an older shape. */
function isPlan(row: unknown): row is JournalPlan {
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

async function planIn(store: IDBObjectStore): Promise<JournalPlan | null> {
  const row: unknown = await result(store.get(CURRENT))
  return isPlan(row) ? row : null
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

    async audio(cutId): Promise<Blob | null> {
      const tx = (await connect()).transaction(AUDIO, "readonly")
      const blob: unknown = await result(tx.objectStore(AUDIO).get(cutId))
      return blob instanceof Blob ? blob : null
    },

    async open(plan, drop): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
      tx.objectStore(PLAN).put(plan, CURRENT)
      for (const cutId of drop) {
        tx.objectStore(TAKES).delete(cutId)
        tx.objectStore(AUDIO).delete(cutId)
      }
      await done(tx)
      changed()
    },

    async setTargets(targets): Promise<void> {
      const tx = (await connect()).transaction(PLAN, "readwrite")
      const store = tx.objectStore(PLAN)
      const plan = await planIn(store)
      if (plan === null) {
        tx.abort()
        throw new JournalStaleError()
      }
      store.put({ ...plan, targets }, CURRENT)
      await done(tx)
      changed()
    },

    async saveTake(take, audio): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
      const audios = tx.objectStore(AUDIO)
      const plan = await planIn(tx.objectStore(PLAN))
      if (!plan?.primer.cuts.some((cut) => cut.id === take.cutId)) {
        tx.abort()
        throw new JournalStaleError()
      }
      if (
        (await bytesBesides(audios, take.cutId)) + audio.size >
        JOURNAL_TAKES_MAX_BYTES
      ) {
        tx.abort()
        throw new JournalFullError()
      }
      tx.objectStore(TAKES).put(take)
      audios.put(audio, take.cutId)
      tx.objectStore(PLAN).put({ ...plan, touchedAt: take.recordedAt }, CURRENT)
      await done(tx)
      changed()
    },

    async clear(): Promise<void> {
      const tx = (await connect()).transaction(
        [PLAN, TAKES, AUDIO],
        "readwrite"
      )
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
      if (left.length === 0 && plan?.openedAt === sent.openedAt)
        tx.objectStore(PLAN).clear()
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
