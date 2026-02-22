import { useSyncExternalStore } from "react"
import type { TypedTypingGame } from "@input/types/leetype"

export function createTypingGameStore(gameRef: {
  current: TypedTypingGame | null
}): { useStats: () => ReturnType<TypedTypingGame["getStats"]> | null } {
  return {
    useStats(): ReturnType<TypedTypingGame["getStats"]> | null {
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
    },
  }
}
