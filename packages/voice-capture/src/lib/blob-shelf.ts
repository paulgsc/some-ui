/**
 * Audio kept on the phone by id, in its own IndexedDB database, refusing a
 * write that would take it past `maxBytes` in the same transaction as the
 * write, or past the device's room (`./room`). What the audio belongs to,
 * and whether it may be kept at all, is the caller's: the shelf only holds
 * the bytes.
 */
import { bytesBesides, connection, done, result } from "./idb"
import { fitsRoom } from "./room"

export type BlobShelf = {
  /**
   * Rejects with `ShelfFullError`, keeping nothing, past `maxBytes` or the
   * device's room.
   */
  put: (id: string, blob: Blob) => Promise<void>
  get: (id: string) => Promise<Blob | null>
  remove: (ids: ReadonlyArray<string>) => Promise<void>
  /** Every id with a blob kept. */
  ids: () => Promise<Array<string>>
}

export class ShelfFullError extends Error {
  constructor() {
    super("the shelf is at its storage cap")
    this.name = "ShelfFullError"
  }
}

const STORE = "blobs"

export function blobShelf({
  dbName,
  maxBytes,
}: {
  dbName: string
  maxBytes: number
}): BlobShelf {
  const connect = connection(dbName, 1, (db) => {
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
  })

  return {
    async put(id, blob): Promise<void> {
      if (!(await fitsRoom(blob.size))) throw new ShelfFullError()
      const tx = (await connect()).transaction(STORE, "readwrite")
      const blobs = tx.objectStore(STORE)
      if ((await bytesBesides(blobs, id)) + blob.size > maxBytes) {
        tx.abort()
        throw new ShelfFullError()
      }
      blobs.put(blob, id)
      await done(tx)
    },

    async get(id): Promise<Blob | null> {
      const tx = (await connect()).transaction(STORE, "readonly")
      const blob: unknown = await result(tx.objectStore(STORE).get(id))
      return blob instanceof Blob ? blob : null
    },

    async remove(ids): Promise<void> {
      if (ids.length === 0) return
      const tx = (await connect()).transaction(STORE, "readwrite")
      for (const id of ids) tx.objectStore(STORE).delete(id)
      await done(tx)
    },

    async ids(): Promise<Array<string>> {
      const tx = (await connect()).transaction(STORE, "readonly")
      const keys = await result(tx.objectStore(STORE).getAllKeys())
      return keys.filter((key): key is string => typeof key === "string")
    },
  }
}

/**
 * A shelf opened at its first use, once per page load, beside the ids whose
 * audio is still being written: not yet named by the list that keeps them,
 * so a sweep for orphans must pass them over.
 */
export function savingShelf(options: { dbName: string; maxBytes: number }): {
  shelf: () => BlobShelf
  saving: (id: string, inFlight: boolean) => void
  isSaving: (id: string) => boolean
} {
  let shelf: BlobShelf | null = null
  const inFlight = new Set<string>()
  return {
    shelf: () => (shelf ??= blobShelf(options)),
    saving: (id, writing): void => {
      if (writing) inFlight.add(id)
      else inFlight.delete(id)
    },
    isSaving: (id) => inFlight.has(id),
  }
}
