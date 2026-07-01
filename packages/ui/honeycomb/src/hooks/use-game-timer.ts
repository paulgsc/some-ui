import { useEffect, useRef, useSyncExternalStore } from "react"
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

  // Track if terminal callbacks have fired
  const terminalFiredRef = useRef(false)

  /**
   * Start timer exactly once per initialization
   */
  useEffect(() => {
    if (!gameBridge || !isInitialized || hasStartedRef.current) return

    gameBridge.startTimer()
    hasStartedRef.current = true
  }, [gameBridge, isInitialized])

  /**
   * Handle terminal states (complete/timeout)
   * Fire callbacks only once
   */
  useEffect(() => {
    if (!gameStatus || terminalFiredRef.current) return

    if (gameStatus.isComplete) {
      terminalFiredRef.current = true
      onComplete?.(gameStatus)
    } else if (gameStatus.isTimedOut) {
      terminalFiredRef.current = true
      onTimeout?.(gameStatus)
    }
  }, [gameStatus, onComplete, onTimeout])

  /**
   * Reset terminal flag when game resets
   */
  useEffect(() => {
    if (!isInitialized) {
      terminalFiredRef.current = false
      hasStartedRef.current = false
    }
  }, [isInitialized])

  const isGameOver =
    !!gameStatus && (gameStatus.isComplete || gameStatus.isTimedOut)

  return {
    gameStatus,
    isGameOver,
    timeRemainingMs: gameStatus?.timeRemainingMs ?? 0,
    progress: gameStatus?.progress,
  }
}
