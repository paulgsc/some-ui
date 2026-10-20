/**
 * IndexedDB as promises, for stores that keep audio on the phone (the
 * soundbites store, `./blob-shelf`): each opens its own database through
 * `connection` and waits on requests and transactions through `result` and
 * `done`.
 */

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve()
    tx.onabort = (): void => reject(tx.error ?? new Error("write aborted"))
    tx.onerror = (): void => reject(tx.error ?? new Error("write failed"))
  })
}

export function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void =>
      reject(request.error ?? new Error("read failed"))
  })
}

/**
 * The bytes of every blob in `store` but the one under `key`: what stays
 * when a write under `key` replaces it. Read inside the caller's
 * transaction, so a cap checked against it holds for that write.
 */
export async function bytesBesides(
  store: IDBObjectStore,
  key: IDBValidKey
): Promise<number> {
  const keys = await result(store.getAllKeys())
  const kept: Array<unknown> = await result(store.getAll())
  return kept.reduce<number>(
    (sum, each, i) =>
      keys[i] === key || !(each instanceof Blob) ? sum : sum + each.size,
    0
  )
}

/**
 * The bytes the blobs under `keys` hold in `store`, in a read of their own:
 * what a write that replaces or displaces them frees, so the device's room
 * is asked only for the write's growth (`withRoom`).
 */
export async function bytesOf(
  db: IDBDatabase,
  store: string,
  keys: ReadonlyArray<IDBValidKey>
): Promise<number> {
  if (keys.length === 0) return 0
  const blobs = db.transaction(store, "readonly").objectStore(store)
  const found: Array<unknown> = await Promise.all(
    keys.map((key) => result(blobs.get(key)))
  )
  return found.reduce<number>(
    (sum, each) => (each instanceof Blob ? sum + each.size : sum),
    0
  )
}

/**
 * Opens `name` on first use and keeps it open. A failed open is not kept:
 * the caller offers a retry, which must get a fresh attempt rather than the
 * same rejection.
 */
export function connection(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
  onFirstOpen?: () => void
): () => Promise<IDBDatabase> {
  let db: Promise<IDBDatabase> | null = null
  return () => {
    if (db === null) {
      onFirstOpen?.()
      const request = indexedDB.open(name, version)
      request.onupgradeneeded = (): void => upgrade(request.result)
      db = result(request).catch((error: unknown) => {
        db = null
        throw error
      })
    }
    return db
  }
}
