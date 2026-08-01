/**
 * @module queue/store
 *
 * The minimal reducer store the speech queue runs on.
 *
 * It is a trimmed copy of the generic "ochestra" store that used to live in
 * `some-ui-utils` - which the S2 census (`packages/UTILS_CENSUS.md` §14)
 * found had no consumers outside that package at all. Copying the ~60 lines
 * the queue actually uses is cheaper than the alternative: a dependency
 * from this workspace back onto `some-ui-utils`, which now depends on
 * *this* one for its speech shim, would be a cycle.
 *
 * Two deliberate differences from the original, both about teardown:
 * `dispatch` applies synchronously, and `dispose` exists. The original ran
 * a macrotask-paced action queue, which meant a session that had already
 * been torn down could still be applying actions dispatched before it died
 * - the same shape of leak as the promise bug this package's rewrite is
 * about. Its two riders on that queue go with it: key-dedupe (only ever
 * suppressed a duplicate dispatched inside the queue's own drain window,
 * which no longer exists) and action-level priority (item priority is the
 * reducer's job, and always was - see `reducer.ts`'s ordered insert).
 */

export type Action<K extends string = string> = {
  type: K
  key?: string
  priority?: number
}

export type Reducer<T, A extends Action> = (state: T, action: A) => T

export type Selector<T, S> = (state: T) => S

export type Store<T, A extends Action> = {
  get: () => Readonly<T>
  subscribe: <S>(
    selector: Selector<T, S>,
    listener: (value: S) => void
  ) => () => void
  dispatch: (action: A) => void
  /** Drops every listener. Dispatches after this only mutate state. */
  dispose: () => void
}

export function createStore<T, A extends Action>(
  initial: T,
  reducer: Reducer<T, A>
): Store<T, A> {
  let state = initial
  let disposed = false
  const listeners = new Set<(next: T) => void>()

  return {
    get: (): Readonly<T> => state,

    subscribe: <S>(
      selector: Selector<T, S>,
      listener: (value: S) => void
    ): (() => void) => {
      let previous = selector(state)
      const wrapped = (next: T): void => {
        const selected = selector(next)
        if (selected === previous) return
        previous = selected
        listener(selected)
      }
      listeners.add(wrapped)
      return () => {
        listeners.delete(wrapped)
      }
    },

    dispatch: (action: A): void => {
      const next = reducer(state, action)
      if (next === state) return
      state = next
      if (disposed) return
      for (const listener of [...listeners]) listener(state)
    },

    dispose: (): void => {
      disposed = true
      listeners.clear()
    },
  }
}
