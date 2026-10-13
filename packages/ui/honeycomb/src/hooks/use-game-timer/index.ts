import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react"
import type {
  GameStatus,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

type UseGameTimerProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  onComplete?: (status: GameStatus) => void
  onTimeout?: (status: GameStatus) => void
}

type UseGameTimerReturn = {
  gameStatus: GameStatus | null
  isGameOver: boolean
  timeRemainingMs: number
  progress: GameStatus["progress"] | undefined
}

export function useGameTimer({
  gameBridge,
  isInitialized,
  onComplete,
  onTimeout,
}: UseGameTimerProps): UseGameTimerReturn {
  // Subscribe to WASM status changes
  const gameStatus = useSyncExternalStore(
    (callback): (() => void) => {
      if (!gameBridge) return () => {}
      return gameBridge.subscribeToStatus(callback)
    },
    () => (gameBridge ? gameBridge.getStatusSnapshot() : null),
    () => null // Server snapshot (not used)
  )

  // Track if timer has been started
  const hasStartedRef = useRef(false)

  // Starts the bridge's timer once per mount.
  useEffect(() => {
    if (!gameBridge || !isInitialized || hasStartedRef.current) return

    gameBridge.startTimer()
    hasStartedRef.current = true
  }, [gameBridge, isInitialized])

  const onTerminal = useEffectEvent((status: GameStatus) => {
    if (status.isComplete) onComplete?.(status)
    else onTimeout?.(status)
  })

  // Fires on each non-terminal -> terminal edge, at the bridge's own
  // notification: a reset (null status) re-arms it for the next game.
  useEffect(() => {
    if (!gameBridge) return undefined
    let wasTerminal = isTerminal(gameBridge.getStatusSnapshot())
    return gameBridge.subscribeToStatus(() => {
      const status = gameBridge.getStatusSnapshot()
      const terminal = isTerminal(status)
      if (status && terminal && !wasTerminal) onTerminal(status)
      wasTerminal = terminal
    })
  }, [gameBridge])

  const isGameOver = isTerminal(gameStatus)

  return {
    gameStatus,
    isGameOver,
    timeRemainingMs: gameStatus?.timeRemainingMs ?? 0,
    progress: gameStatus?.progress,
  }
}

function isTerminal(status: GameStatus | null): boolean {
  return !!status && (status.isComplete || status.isTimedOut)
}
