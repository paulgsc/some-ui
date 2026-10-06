/**
 * @module queue/store
 *
 * The minimal reducer store the speech queue runs on.
 *
 * Local rather than imported from `some-ui-utils`, which depends on this
 * package for its speech shim: importing it back would be a cycle.
 *
 * Both choices are about teardown: `dispatch` applies synchronously, so a
 * torn-down session cannot still be applying actions dispatched before it
 * died, and `dispose` exists. Item priority is the reducer's job (see
 * `reducer.ts`'s ordered insert), not the store's.
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
