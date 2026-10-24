import type {
  ArchivedMeta,
  ArchiveResult,
  AskResult,
  Folder,
  ItemMeta,
  PutResult,
  Putter,
  RestoreResult,
  Store,
  StoredItem,
  WantedMeta,
} from "@mailbox/store"

type Live = StoredItem & { readonly folder: Folder; readonly putBy: Putter }
type Gone = ArchivedMeta & { readonly folder: Folder; readonly putBy: Putter }

function metaOf(item: Live): ItemMeta {
  const { seq, name, size, sha256, contentType, putAt, liveSince } = item
  return { seq, name, size, sha256, contentType, putAt, liveSince }
}

function archivedMetaOf(row: Gone): ArchivedMeta {
  const { seq, name, size, sha256, contentType, putAt, archivedAt } = row
  return { seq, name, size, sha256, contentType, putAt, archivedAt }
}

/** A `Store` in memory, for the tests of `core.ts`. */
export function memoryStore(): Store {
  let live: Array<Live> = []
  const archived: Array<Gone> = []
  let wanted: Array<WantedMeta & { readonly folder: Folder }> = []
  let lastSeq = 0

  const liveOf = (folder: Folder, name: string): Live | undefined =>
    live.find((i) => i.folder === folder && i.name === name)
  const archivedOf = (folder: Folder, name: string): Gone | undefined =>
    archived
      .filter((row) => row.folder === folder && row.name === name)
      .sort((a, b) => b.seq - a.seq)
      .at(0)

  return {
    list(folder, after, limit): Promise<ReadonlyArray<ItemMeta>> {
      return Promise.resolve(
        live
          .filter((item) => item.folder === folder && item.seq > after)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map(metaOf)
      )
    },
    get(folder, name): Promise<StoredItem | null> {
      const found = liveOf(folder, name)
      // Exactly the adapter's fields: the internal ones stay internal.
      return Promise.resolve(
        found === undefined ? null : { ...metaOf(found), bytes: found.bytes }
      )
    },
    put(folder, name, item): Promise<PutResult> {
      const gone = archivedOf(folder, name)
      const existing = liveOf(folder, name)
      const held = existing ?? gone
      if (held !== undefined) {
        return Promise.resolve(
          held.sha256 === item.sha256
            ? { change: "unchanged", seq: held.seq }
            : { change: "conflict" }
        )
      }
      lastSeq += 1
      live.push({
        folder,
        name,
        seq: lastSeq,
        size: item.bytes.byteLength,
        sha256: item.sha256,
        contentType: item.contentType,
        putAt: item.putAt,
        liveSince: item.putAt,
        putBy: item.putBy,
        bytes: item.bytes,
      })
      return Promise.resolve({ change: "added", seq: lastSeq })
    },
    archivedOf(folder, name): Promise<ArchivedMeta | null> {
      const gone = archivedOf(folder, name)
      return Promise.resolve(gone === undefined ? null : archivedMetaOf(gone))
    },
    listArchived(folder, after, limit): Promise<ReadonlyArray<ArchivedMeta>> {
      return Promise.resolve(
        archived
          .filter((row) => row.folder === folder && row.seq > after)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map(archivedMetaOf)
      )
    },
    archive(
      folder,
      name,
      sha256,
      archivedAt,
      liveBefore
    ): Promise<ArchiveResult> {
      const item = liveOf(folder, name)
      if (item === undefined) {
        const gone = archivedOf(folder, name)
        if (gone === undefined) return Promise.resolve({ change: "absent" })
        return Promise.resolve({
          change: gone.sha256 === sha256 ? "unchanged" : "mismatch",
        })
      }
      if (item.sha256 !== sha256) return Promise.resolve({ change: "mismatch" })
      if (item.liveSince > liveBefore) {
        return Promise.resolve({ change: "too_young" })
      }
      archived.push({
        folder,
        name,
        seq: item.seq,
        size: item.size,
        sha256: item.sha256,
        contentType: item.contentType,
        putAt: item.putAt,
        putBy: item.putBy,
        archivedAt,
      })
      live = live.filter((other) => other !== item)
      return Promise.resolve({ change: "archived" })
    },
    restore(folder, name, bytes, sha256, restoredAt): Promise<RestoreResult> {
      const gone = archivedOf(folder, name)
      if (gone === undefined) return Promise.resolve({ change: "not_archived" })
      if (gone.sha256 !== sha256) return Promise.resolve({ change: "mismatch" })
      const existing = liveOf(folder, name)
      if (existing !== undefined) {
        return Promise.resolve({ change: "unchanged", seq: existing.seq })
      }
      lastSeq += 1
      live.push({
        folder,
        name,
        seq: lastSeq,
        size: gone.size,
        sha256: gone.sha256,
        contentType: gone.contentType,
        putAt: gone.putAt,
        liveSince: restoredAt,
        putBy: gone.putBy,
        bytes,
      })
      wanted = wanted.filter(
        (ask) => ask.folder !== folder || ask.name !== name
      )
      return Promise.resolve({ change: "restored", seq: lastSeq })
    },
    ask(folder, name, askedAt): Promise<AskResult> {
      if (liveOf(folder, name) !== undefined) {
        return Promise.resolve({ change: "live" })
      }
      if (archivedOf(folder, name) === undefined) {
        return Promise.resolve({ change: "not_archived" })
      }
      if (wanted.some((ask) => ask.folder === folder && ask.name === name)) {
        return Promise.resolve({ change: "unchanged" })
      }
      wanted.push({ folder, name, askedAt })
      return Promise.resolve({ change: "asked" })
    },
    listWanted(folder, limit): Promise<ReadonlyArray<WantedMeta>> {
      return Promise.resolve(
        wanted
          .filter((ask) => ask.folder === folder)
          .sort(
            (a, b) =>
              a.askedAt.localeCompare(b.askedAt) || a.name.localeCompare(b.name)
          )
          .slice(0, limit)
          .map(({ name, askedAt }) => ({ name, askedAt }))
      )
    },
  }
}

function everyCall(call: () => Promise<never>): Store {
  return {
    list: call,
    get: call,
    put: call,
    archivedOf: call,
    listArchived: call,
    archive: call,
    restore: call,
    ask: call,
    listWanted: call,
  }
}

/** A store that counts every call and fails it: for "before the store is touched". */
export function untouchable(): { store: Store; touched: () => number } {
  let calls = 0
  return {
    store: everyCall(() => {
      calls += 1
      return Promise.reject(new Error("the store was touched"))
    }),
    touched: () => calls,
  }
}

/** A store whose every call fails with `error`, as D1 does past its daily limit. */
export function failing(error: Error): Store {
  return everyCall(() => Promise.reject(error))
}
