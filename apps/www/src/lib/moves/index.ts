/**
 * A count that moves each time something kept on this phone changes, for
 * whoever reads it with `useSyncExternalStore` or subscribes: the voice
 * lane's record hears Studio's ideas (`lib/idea-keeping`) and videos
 * (`lib/home-link/videos`) move through one. It calls nothing and sends
 * nothing. Phone-only (`build.paths.ts`).
 */
export type Moves = {
  readonly getSnapshot: () => number
  readonly subscribe: (listener: () => void) => () => void
}

/** A count, and the one way to move it: each listener is told once a move. */
export function movesSignal(): {
  readonly moves: Moves
  readonly moved: () => void
} {
  let count = 0
  const listeners = new Set<() => void>()
  return {
    moves: {
      getSnapshot: () => count,
      subscribe(listener): () => void {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    },
    moved(): void {
      count += 1
      for (const listener of listeners) listener()
    },
  }
}
