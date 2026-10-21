import type {
  Folder,
  ItemMeta,
  PutResult,
  Store,
  StoredItem,
} from "@mailbox/store"

type Held = StoredItem & { readonly folder: Folder }

/**
 * A `Store` in memory, for the tests of `core.ts`. `store.test.ts` runs the
 * same contract against it and against the D1 adapter on real SQLite, so it
 * cannot drift from what D1 does.
 */
export function memoryStore(): Store {
  const held: Array<Held> = []
  return {
    list(folder, after, limit): Promise<ReadonlyArray<ItemMeta>> {
      const items: ReadonlyArray<ItemMeta> = held
        .filter((item) => item.folder === folder && item.seq > after)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        .map(({ seq, name, size, sha256, contentType, putAt }) => ({
          seq,
          name,
          size,
          sha256,
          contentType,
          putAt,
        }))
      return Promise.resolve(items)
    },
    get(folder, name): Promise<StoredItem | null> {
      const found = held.find((i) => i.folder === folder && i.name === name)
      if (found === undefined) return Promise.resolve(null)
      // Exactly the adapter's fields: the internal folder stays internal.
      return Promise.resolve({
        seq: found.seq,
        name: found.name,
        size: found.size,
        sha256: found.sha256,
        contentType: found.contentType,
        putAt: found.putAt,
        bytes: found.bytes,
      })
    },
    put(folder, name, item): Promise<PutResult> {
      const existing = held.find((i) => i.folder === folder && i.name === name)
      if (existing !== undefined) {
        return Promise.resolve(
          existing.sha256 === item.sha256
            ? { change: "unchanged", seq: existing.seq }
            : { change: "conflict" }
        )
      }
      const seq = held.length + 1
      held.push({
        folder,
        name,
        seq,
        size: item.bytes.byteLength,
        sha256: item.sha256,
        contentType: item.contentType,
        putAt: item.putAt,
        bytes: item.bytes,
      })
      return Promise.resolve({ change: "added", seq })
    },
  }
}

/** A store that counts every call and fails it: for "before the store is touched". */
export function untouchable(): { store: Store; touched: () => number } {
  let calls = 0
  const touch = (): Promise<never> => {
    calls += 1
    return Promise.reject(new Error("the store was touched"))
  }
  return {
    store: { list: touch, get: touch, put: touch },
    touched: () => calls,
  }
}

/** A store whose every call fails with `error`, as D1 does past its daily limit. */
export function failing(error: Error): Store {
  const fail = (): Promise<never> => Promise.reject(error)
  return { list: fail, get: fail, put: fail }
}
