/**
 * An in-memory `storage.local` whose reads can be held or failed per key,
 * which is what makes an interleaving (another tab writing between a read and
 * its result, a session switch during a read) observable in a unit test.
 */

/**
 * The key a whole-area read (`get(null)`, or `getKeys()`) is presented to
 * `hold` and `fail` under.
 */
export const WHOLE_AREA = "*"

export type HeldRead = { readonly key: string; readonly release: () => void }

export type FakeStorageOptions = {
  /**
   * Defer a read that touches this key until the test releases it. The
   * result is what the store held when the read was *issued*, so a release
   * delivers a stale snapshot, as a real overtaken read would.
   */
  hold?: (key: string) => boolean
  /** Reject a read that touches this key. */
  fail?: (key: string) => boolean
  /** Reject a `remove` of these keys. */
  failRemove?: (keys: ReadonlyArray<string>) => boolean
  /** Expose `getKeys()`, as Chrome 130+ and Firefox 143+ do. */
  getKeys?: boolean
  /** Fires on every read, with `null` for a whole-area read. */
  onGet?: (keys: string | Array<string> | null) => void
  /** Fires after each key a `set` writes, so a test can simulate a competing tab. */
  onSet?: (key: string) => void
}

export type FakeStorageArea = {
  get(keys: string | Array<string> | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | Array<string>): Promise<void>
  getKeys?(): Promise<Array<string>>
}

export type FakeStorage = {
  readonly area: FakeStorageArea
  readonly store: Map<string, unknown>
  /** Reads held by `hold`, in the order they were issued. */
  readonly held: Array<HeldRead>
}

export function fakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const store = new Map<string, unknown>()
  const held: Array<HeldRead> = []
  const asList = (keys: string | Array<string> | null): Array<string> =>
    keys === null ? [...store.keys()] : typeof keys === "string" ? [keys] : keys
  const probes = (keys: string | Array<string> | null): Array<string> =>
    keys === null ? [WHOLE_AREA] : typeof keys === "string" ? [keys] : keys

  function settle<T>(probe: Array<string>, value: T): Promise<T> {
    if (probe.some((k) => options.fail?.(k) === true)) {
      return Promise.reject(
        new Error(`storage unavailable: ${probe.join(",")}`)
      )
    }
    const holdKey = probe.find((k) => options.hold?.(k) === true)
    if (holdKey !== undefined) {
      return new Promise((resolve) => {
        held.push({ key: holdKey, release: () => resolve(value) })
      })
    }
    return Promise.resolve(value)
  }

  const area: FakeStorageArea = {
    get: (keys) => {
      options.onGet?.(keys)
      const value: Record<string, unknown> = {}
      for (const k of asList(keys)) if (store.has(k)) value[k] = store.get(k)
      return settle(probes(keys), value)
    },
    set: (items) => {
      for (const [k, v] of Object.entries(items)) {
        store.set(k, v)
        options.onSet?.(k)
      }
      return Promise.resolve()
    },
    remove: (keys) => {
      const list = asList(keys)
      if (options.failRemove?.(list) === true) {
        return Promise.reject(new Error("storage remove failed"))
      }
      for (const k of list) store.delete(k)
      return Promise.resolve()
    },
  }
  if (options.getKeys === true) {
    area.getKeys = (): Promise<Array<string>> =>
      settle([WHOLE_AREA], [...store.keys()])
  }
  return { area, store, held }
}
