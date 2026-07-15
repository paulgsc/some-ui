import { useSyncExternalStore } from "react"
import type { TypedTypingGame } from "@leetype/types/leetype"

// A real hook (not a plain factory) so passing `gameRef` here reads as
// "pass a ref into a hook", not "pass a ref into an arbitrary function
// during render" — the latter is what react-hooks/refs flags, since it
// can't verify an opaque function defers the `.current` read outside render.
export function useTypingGameStats(gameRef: {
  current: TypedTypingGame | null
}): ReturnType<TypedTypingGame["getStats"]> | null {
  return useSyncExternalStore(
    (callback: () => void): (() => void) => {
      const game = gameRef.current
      if (!game?.subscribeStats) {
        return (): void => {}
      }
      return game.subscribeStats(callback)
    },
    (): ReturnType<TypedTypingGame["getStats"]> | null => {
      const game = gameRef.current
      if (!game) return null
      return game.getStats(Date.now())
    },
    (): ReturnType<TypedTypingGame["getStats"]> | null => {
      const game = gameRef.current
      if (!game) return null
      return game.getStats(Date.now())
    }
  )
}
