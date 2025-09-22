export type Action<P = unknown, K extends string = string> = {
  type: K
  payload?: P
  key?: string // for dedupe/idempotence
  priority?: number // higher wins
}

export type Reducer<T, A extends Action = Action> = (state: T, action: A) => T

export type Selector<T, S> = (state: T) => S

export type Listener<S> = (val: S) => void

// Store interface parameterized by state + action
export type Store<T, A extends Action = Action> = {
  get: () => Readonly<T>

  subscribe: <S>(selector: Selector<T, S>, callback: Listener<S>) => () => void

  dispatch(action: A): void

  flush: () => void
}

export function createStore<T, A extends Action>(
  initial: T,
  reducer: Reducer<T, A>
): Store<T, A> {
  let state = initial
  const listeners = new Set<(s: T) => void>()
  const queue: Array<A> = []
  const seenKeys = new Set<string>()
  let processing = false

  function get(): Readonly<T> {
    return state
  }

  function subscribe<S>(
    selector: Selector<T, S>,
    cb: Listener<S>
  ): () => boolean {
    let prev = selector(state)
    const listener = (s: T): void => {
      const next = selector(s)
      if (next !== prev) {
        prev = next
        cb(next)
      }
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function notify(): void {
    for (const l of listeners) l(state)
  }

  function apply(action: A): void {
    const next = reducer(state, action)
    if (next !== state) {
      state = next
      notify()
    }
  }

  async function process(): Promise<void> {
    if (processing) return
    processing = true

    while (queue.length > 0) {
      const action = queue.shift()!
      if (action.key) seenKeys.delete(action.key)
      apply(action)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    processing = false
  }

  function dispatch(action: A): void {
    // Dedupe by key
    if (action.key && seenKeys.has(action.key)) return
    if (action.key) seenKeys.add(action.key)

    const priority = action.priority ?? 0
    // Insert by descending priority (highest first)
    const idx = queue.findIndex((a) => (a.priority ?? 0) < priority)
    if (idx === -1) queue.push(action)
    else queue.splice(idx, 0, action)

    process()
  }

  function flush(): void {
    while (queue.length > 0) {
      const action = queue.shift()!
      if (action.key) seenKeys.delete(action.key)
      apply(action)
    }
  }

  return { get, subscribe, dispatch, flush }
}
