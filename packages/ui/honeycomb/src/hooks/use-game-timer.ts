import { useCallback, useEffect, useRef, useState } from "react"
import type {
  GameStatus,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

type UseGameTimerProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  onComplete?: (status: GameStatus) => void
  onTimeout?: (status: GameStatus) => void
  pollIntervalMs?: number
}

export function useGameTimer({
  gameBridge,
  isInitialized,
  isPaused,
  onComplete,
  onTimeout,
  pollIntervalMs = 100,
}: UseGameTimerProps) {
  const [gameStatus, setGameStatus] = useState<GameStatus | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)

  // Has startTimer been called?
  const hasStartedRef = useRef(false)
  const intervalRef = useRef<number | null>(null)

  /**
   * Start timer exactly once per initialization
   */
  useEffect(() => {
    if (!gameBridge || !isInitialized || hasStartedRef.current) return

    gameBridge.startTimer(Date.now())
    hasStartedRef.current = true
  }, [gameBridge, isInitialized])

  /**
   * Poll game status
   */
  const pollStatus = useCallback(() => {
    if (!gameBridge || isPaused || isGameOver) return

    const now = Date.now()
    const status = gameBridge.getGameStatus(now)

    setGameStatus(status)

    if (status.isComplete) {
      setIsGameOver(true)
      onComplete?.(status)
    } else if (status.isTimedOut) {
      setIsGameOver(true)
      onTimeout?.(status)
    }
  }, [gameBridge, isPaused, isGameOver, onComplete, onTimeout])

  /**
   * Polling lifecycle
   */
  useEffect(() => {
    if (!gameBridge || !isInitialized || isPaused || isGameOver) return

    // Poll immediately for responsiveness
    pollStatus()

    intervalRef.current = window.setInterval(pollStatus, pollIntervalMs)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [
    gameBridge,
    isInitialized,
    isPaused,
    isGameOver,
    pollStatus,
    pollIntervalMs,
  ])

  /**
   * Reset internal state when game resets
   */
  useEffect(() => {
    if (isInitialized) return

    setGameStatus(null)
    setIsGameOver(false)
    hasStartedRef.current = false
  }, [isInitialized])

  return {
    gameStatus,
    isGameOver,
    timeRemainingMs: gameStatus?.timeRemainingMs ?? 0,
    progress: gameStatus?.progress,
  }
}
