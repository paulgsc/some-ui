/**
 * A store of one value for a runtime's snapshot: read with `getSnapshot`,
 * watched with `subscribe` (as `useSyncExternalStore` takes them), and told
 * to its listeners only when `set` changes it.
 */
export type Readable<T> = {
  readonly getSnapshot: () => T
  readonly subscribe: (listener: () => void) => () => void
}

export function cell<T>(first: T): Readable<T> & { set: (next: T) => void } {
  let value = first
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    set(next): void {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}
