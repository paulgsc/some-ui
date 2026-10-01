/**
 * Where soundbites live: the WebView's IndexedDB, on the phone, and nowhere
 * else. Blobs go in as they are (no base64), metadata beside them, and the
 * cap is enforced in the same transaction as the write, so no sequence of
 * saves can leave more than `SOUNDBITE_LIMIT` on the phone.
 *
 * Not the device backend's SQLite: these are not `file_host` data, the
 * server has no route for them, and audio is the one thing that database
 * would hold as large opaque values for no query to read.
 */
import { byNewest, displacedBy, SOUNDBITE_LIMIT } from "./policy"
import type { Soundbite } from "./types"

export type SoundbiteStore = {
  /** Every kept soundbite, newest first. */
  list: () => Promise<Array<Soundbite>>
  audio: (id: string) => Promise<Blob | null>
  /**
   * Keeps `bite` with its audio. When the phone already holds the limit, it
   * replaces `replace` if that is still kept, else the oldest.
   */
  save: (bite: Soundbite, audio: Blob, replace: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
}

const DB_NAME = "some-ui.soundbites"
const DB_VERSION = 1
const META = "meta"
const AUDIO = "audio"

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve()
    tx.onabort = (): void =>
      reject(tx.error ?? new Error("soundbite write aborted"))
    tx.onerror = (): void =>
      reject(tx.error ?? new Error("soundbite write failed"))
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void =>
      reject(request.error ?? new Error("soundbite read failed"))
  })
}

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

function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = (): void => {
    const db = request.result
    if (!db.objectStoreNames.contains(META))
      db.createObjectStore(META, { keyPath: "id" })
    if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO)
  }
  return result(request)
}

/**
 * The phone's store. Opened on first use and kept open; asks once for
 * persistent storage, so the WebView does not evict the recordings under
 * storage pressure before anyone has listened to them.
 */
export function indexedDbSoundbiteStore(): SoundbiteStore {
  let db: Promise<IDBDatabase> | null = null
  const connect = (): Promise<IDBDatabase> => {
    if (db === null) {
      // Best effort: a refusal still leaves ordinary (evictable) storage.
      if ("storage" in navigator)
        void navigator.storage.persist().catch(() => false)
      // A failed open is not kept: the page offers a retry, which must get
      // a fresh attempt rather than the same rejection.
      db = open().catch((error: unknown) => {
        db = null
        throw error
      })
    }
    return db
  }

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
      const tx = (await connect()).transaction([META, AUDIO], "readwrite")
      const meta = tx.objectStore(META)
      const audios = tx.objectStore(AUDIO)
      // Read and evict inside the one transaction: the cap holds even if two
      // saves overlap (a second tab of the WebView, say).
      const kept = await allKept(meta)
      for (const id of displacedBy(kept, replace, SOUNDBITE_LIMIT)) {
        meta.delete(id)
        audios.delete(id)
      }
      meta.put(bite)
      audios.put(audio, bite.id)
      await done(tx)
    },

    async remove(id): Promise<void> {
      const tx = (await connect()).transaction([META, AUDIO], "readwrite")
      tx.objectStore(META).delete(id)
      tx.objectStore(AUDIO).delete(id)
      await done(tx)
    },
  }
}
