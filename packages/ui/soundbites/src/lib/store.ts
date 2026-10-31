/**
 * Where soundbites live on the phone: the WebView's IndexedDB. Blobs go in
 * as they are (no base64), metadata beside them, and the cap is enforced in
 * the same transaction as the write, so no sequence of saves can leave more
 * than `SOUNDBITE_LIMIT` on the phone. The cap is an offline set: a save
 * past it lets go only soundbites home holds (`./home-held`), and is refused
 * while home holds too few. Each soundbite goes home through www's home link
 * (HF5, #2180): its audio as a voice note, its record as a study note.
 *
 * Not the device backend's SQLite: audio is the one thing that database
 * would hold as large opaque values for no query to read.
 */
import {
  bytesOf,
  connection,
  done,
  result,
  withRoom,
} from "@some-ui/voice-capture"

import { homeHoldsNow } from "./home-held"
import { byNewest, displacedBy, fitsMaxBytes, SOUNDBITE_LIMIT } from "./policy"
import type { Soundbite } from "./types"

export type SoundbiteStore = {
  /** Every kept soundbite, newest first. */
  list: () => Promise<Array<Soundbite>>
  audio: (id: string) => Promise<Blob | null>
  /**
   * Keeps `bite` with its audio. When the phone already holds the limit, it
   * replaces `replace` if that is still kept and home holds it, else the
   * oldest home holds. Rejects with `SoundbitesFullError`, keeping nothing,
   * while home holds none to replace, past `SOUNDBITES_MAX_BYTES` or past
   * the device's room.
   */
  save: (bite: Soundbite, audio: Blob, replace: string | null) => Promise<void>
  /** Lets go of each of `ids` still kept, in one transaction. */
  remove: (ids: ReadonlyArray<string>) => Promise<void>
  /**
   * Calls `listener` after each save or remove commits, on this page, so a
   * page showing the list can re-read it. Returns an unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
}

export class SoundbitesFullError extends Error {
  constructor() {
    super("soundbites are at their storage cap")
    this.name = "SoundbitesFullError"
  }
}

const DB_NAME = "some-ui.soundbites"
const DB_VERSION = 1
const META = "meta"
const AUDIO = "audio"

/**
 * Whether a stored row is a soundbite. Only this module writes `META`, so
 * this is a guard against an older shape, not against strangers.
 */
function isSoundbite(row: unknown): row is Soundbite {
  return (
    typeof row === "object" &&
    row !== null &&
    "id" in row &&
    typeof row.id === "string" &&
    "recordedAt" in row &&
    typeof row.recordedAt === "string"
  )
}

/** Every kept soundbite's metadata. */
async function allKept(meta: IDBObjectStore): Promise<Array<Soundbite>> {
  const rows: Array<unknown> = await result(meta.getAll())
  return rows.filter(isSoundbite)
}

/**
 * Asks once per database for persistent storage, so the WebView does not
 * evict recordings under storage pressure before anyone has listened to
 * them. Best effort: a refusal still leaves ordinary (evictable) storage.
 */
export function askToKeep(): void {
  if ("storage" in navigator)
    void navigator.storage.persist().catch(() => false)
}

/** The phone's store. Opened on first use and kept open. */
export function indexedDbSoundbiteStore(): SoundbiteStore {
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  const connect = connection(
    DB_NAME,
    DB_VERSION,
    (db) => {
      if (!db.objectStoreNames.contains(META))
        db.createObjectStore(META, { keyPath: "id" })
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO)
    },
    askToKeep
  )

  return {
    async list(): Promise<Array<Soundbite>> {
      const tx = (await connect()).transaction(META, "readonly")
      return byNewest(await allKept(tx.objectStore(META)))
    },

    async audio(id): Promise<Blob | null> {
      const tx = (await connect()).transaction(AUDIO, "readonly")
      const blob: unknown = await result(tx.objectStore(AUDIO).get(id))
      return blob instanceof Blob ? blob : null
    },

    async save(bite, audio, replace): Promise<void> {
      const db = await connect()
      const leaving = displacedBy(
        await allKept(db.transaction(META, "readonly").objectStore(META)),
        replace,
        homeHoldsNow(),
        SOUNDBITE_LIMIT
      )
      if (leaving === null) throw new SoundbitesFullError()
      const freed = await bytesOf(db, AUDIO, leaving)
      await withRoom(
        audio.size - freed,
        async (claim): Promise<void> => {
          const tx = db.transaction([META, AUDIO], "readwrite")
          const meta = tx.objectStore(META)
          const audios = tx.objectStore(AUDIO)
          // Read and evict inside the one transaction: the cap holds even if two
          // saves overlap (a second tab of the WebView, say).
          const kept = await allKept(meta)
          const displaced = displacedBy(
            kept,
            replace,
            homeHoldsNow(),
            SOUNDBITE_LIMIT
          )
          if (displaced === null) {
            tx.abort()
            throw new SoundbitesFullError()
          }
          const staying = await Promise.all(
            kept
              .filter((each) => !displaced.includes(each.id))
              .map(async (each) => {
                const blob: unknown = await result(audios.get(each.id))
                return blob instanceof Blob ? blob.size : 0
              })
          )
          const displacing = await Promise.all(
            displaced.map(async (id) => {
              const blob: unknown = await result(audios.get(id))
              return blob instanceof Blob ? blob.size : 0
            })
          )
          const frees = displacing.reduce((sum, size) => sum + size, 0)
          if (
            !fitsMaxBytes(staying, audio.size) ||
            audio.size - frees > claim
          ) {
            tx.abort()
            throw new SoundbitesFullError()
          }
          for (const id of displaced) {
            meta.delete(id)
            audios.delete(id)
          }
          meta.put(bite)
          audios.put(audio, bite.id)
          await done(tx)
        },
        () => new SoundbitesFullError()
      )
      changed()
    },

    async remove(ids): Promise<void> {
      const tx = (await connect()).transaction([META, AUDIO], "readwrite")
      for (const id of ids) {
        tx.objectStore(META).delete(id)
        tx.objectStore(AUDIO).delete(id)
      }
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
