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
