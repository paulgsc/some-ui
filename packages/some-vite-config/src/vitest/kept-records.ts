/**
 * KR1: a kept record is never lost to a read (CLAUDE.md, "Never lose the
 * record"). The one test of it: each workspace's `kept-records.test.ts` runs
 * its kept stores through `describeKeptRecords`.
 *
 * - **Claim:** in apps/www and packages/ui, no store that keeps a record in
 *   the page's storage loses a value it cannot read whole: it reads through
 *   core-utils' `openKept` (or `openRecord`) and writes through
 *   `writeKept` (or `writeRecord`), which copy such a value aside under a key
 *   of its own before anything is written over it and write nothing when it
 *   cannot be copied aside; or it leaves the value where it is and writes
 *   nothing until it can read it (`refusesUnreadable`: the consent and
 *   routine choice logs, LA11 and LA12, and LeetType's session index).
 * - **Family:** the stored value (absent, not JSON, an older or foreign shape,
 *   entries only partly readable); the storage (the browser's, one that
 *   refuses every call, one whose quota refuses writes, the viewer's
 *   in-memory copy, `inMemoryStorage`); and reload, a new store over what the
 *   last one left.
 * - **Proof:** these cases, over every store each workspace lists; core-utils'
 *   own storage tests; and `kept-record/no-raw-storage` (packages/eslint),
 *   which keeps a new store from reaching the page's storage around the owner.
 * - **Tolerance:** what a store lets go by design, not by a read: the caps
 *   (`limit`, #2107), the pace book's pruning, the last drama's expiry and a
 *   refused write taking its one record with it (`refusedWriteRemoves`), the
 *   pasted lesson held for the session only (`replacesUnreadable`), a
 *   session deleted, "let it go". A copy aside is kept, and nothing in the
 *   app shows it yet.
 */
// eslint-disable-next-line import/no-extraneous-dependencies -- a test helper, run only under a workspace's own vitest
import { describe, expect, it } from "vitest"

import type { MemoryStorage } from "./memory-storage.js"
import { memoryStorage } from "./memory-storage.js"

type Port = Pick<Storage, "getItem" | "setItem" | "removeItem">

export type KeptHandle = {
  /** Keeps something new; may say it was not kept, never throws. */
  readonly write: () => unknown
  /** What the store shows; never throws. */
  readonly read: () => unknown
}

export type KeptStore = {
  readonly name: string
  readonly key: string
  /** Default `localStorage`. */
  readonly area?: "localStorage" | "sessionStorage"
  /** A stored value in an older or foreign shape its reader rejects. */
  readonly older: string
  /** Why a refused write lets this store's one record go, if it does. */
  readonly refusedWriteRemoves?: string
  /**
   * Why a new value replaces what is held whether or not it could be read,
   * if it does (one slot held for the session, say).
   */
  readonly replacesUnreadable?: string
  /**
   * Why this store leaves a value it cannot read where it is and writes
   * nothing until it can, instead of copying it aside, if it does.
   */
  readonly refusesUnreadable?: string
  /**
   * Opens the store as a launch would, over `storage`, which is also the
   * page's own `area` by then.
   */
  readonly open: (storage: Port) => KeptHandle | Promise<KeptHandle>
}

/** The page's storage for `area`, as the viewer's build installs its own. */
function install(storage: Port, area: KeptStore["area"]): void {
  Object.defineProperty(window, area ?? "localStorage", {
    value: storage,
    configurable: true,
  })
}

const refusing: Port = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError")
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError")
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError")
  },
}

async function opened(store: KeptStore, storage: Port): Promise<KeptHandle> {
  install(storage, store.area)
  return store.open(storage)
}

async function readOn(store: KeptStore, storage: Port): Promise<unknown> {
  return (await opened(store, storage)).read()
}

/** Some key other than the store's own holds `raw` as it was. */
function copiedAside(
  storage: MemoryStorage,
  key: string,
  raw: string
): boolean {
  return [...storage.map].some(([other, held]) => other !== key && held === raw)
}

/**
 * KR1 over `stores`. `viewer` gives the page's storage as the viewer's build
 * installs it, fresh on each call (a reload starts over).
 */
export function describeKeptRecords(
  stores: ReadonlyArray<KeptStore>,
  viewer: (area: "localStorage" | "sessionStorage") => Port | Promise<Port>
): void {
  describe.each(stores.map((store) => [store.name, store] as const))(
    "KR1: %s",
    (_name, store) => {
      it("keeps what it writes across a reload", async () => {
        const empty = await readOn(store, memoryStorage())
        const storage = memoryStorage()
        const first = await opened(store, storage)
        await first.write()
        const kept = await first.read()
        expect(storage.map.has(store.key)).toBe(true)
        expect(kept).not.toEqual(empty)
        expect(await readOn(store, storage)).toEqual(kept)
      })

      it.each([
        ["not JSON", "{torn"],
        ["an older shape", store.older],
      ])("loses no value that is %s", async (_, raw) => {
        const storage = memoryStorage([[store.key, raw]])
        const handle = await opened(store, storage)
        await handle.read()
        await handle.write()
        if (store.refusesUnreadable === undefined) {
          // Copied aside, and the new write landed.
          expect(copiedAside(storage, store.key, raw)).toBe(true)
          expect(storage.map.get(store.key)).not.toBe(raw)
        } else {
          expect(storage.map.get(store.key)).toBe(raw)
        }
      })

      it.skipIf(store.replacesUnreadable !== undefined)(
        "writes nothing over a value it can neither read nor copy aside",
        async () => {
          const storage = memoryStorage([[store.key, "{torn"]])
          // Room for the record's own key, and none for a copy beside it.
          const cramped: Port = {
            getItem: (key) => storage.getItem(key),
            setItem: (key, value) => {
              if (key !== store.key) {
                throw new DOMException("full", "QuotaExceededError")
              }
              storage.setItem(key, value)
            },
            removeItem: (key) => {
              storage.removeItem(key)
            },
          }
          const handle = await opened(store, cramped)
          await handle.read()
          await handle.write()
          expect(storage.map.get(store.key)).toBe("{torn")
        }
      )

      it("leaves the record as it was when the quota refuses a write", async () => {
        const storage = memoryStorage()
        await (await opened(store, storage)).write()
        const kept = storage.map.get(store.key)
        storage.full = true
        await (await opened(store, storage)).write()
        expect(storage.map.get(store.key)).toBe(
          store.refusedWriteRemoves === undefined ? kept : undefined
        )
      })

      it("runs on storage that refuses every call", async () => {
        const handle = await opened(store, refusing)
        await handle.read()
        await handle.write()
        await handle.read()
      })

      it("works on the viewer's in-memory storage, and a reload starts over", async () => {
        const area = store.area ?? "localStorage"
        const empty = await readOn(store, memoryStorage())
        const storage = await viewer(area)
        const handle = await opened(store, storage)
        await handle.write()
        const kept = await handle.read()
        expect(await readOn(store, storage)).toEqual(kept)
        expect(await readOn(store, await viewer(area))).toEqual(empty)
      })
    }
  )
}
