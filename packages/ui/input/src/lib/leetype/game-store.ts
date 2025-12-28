import { useSyncExternalStore } from "react"
import type { TypedTypingGame } from "@input/types/leetype"

/**
 * Creates an external store that subscribes to WASM game stats
 * The gameRef allows the store to access the current game instance dynamically
 */
export function createTypingGameStore(
  gameRef: { current: TypedTypingGame | null }
) {
  return {
    useStats() {
      return useSyncExternalStore(
        (callback) => {
          const game = gameRef.current
          if (!game || !game.subscribeStats) {
            return () => {}
          }
          return game.subscribeStats(callback)
        },
        () => {
          const game = gameRef.current
          if (!game) return null
          // TypedTypingGame.getStats now returns cached reference
          return game.getStats(Date.now())
        },
        () => {
          // SSR fallback
          const game = gameRef.current
          if (!game) return null
          return game.getStats(Date.now())
        }
      )
    },
  }
}
