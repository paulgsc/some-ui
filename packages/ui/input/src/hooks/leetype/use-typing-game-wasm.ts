import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildDisplayMap,
  canonicalizeText,
  loadWasm,
  TypedTypingGame,
} from "@input/lib/leetype/leetype-wasm-loader"
import type {
  CanonicalUnit,
  GameState,
  GameStats,
  InputResult,
} from "@input/types/leetype"

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
  maxConsecutiveErrors?: number
}

type UseTypingGameReturn = {
  userInput: string
  rawUserInput: string
  displayCode: string
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  cursorUnitIndex: number
  displayMap: Array<number>
  errors: number
  consecutiveErrors: number
  showErrorAlert: boolean
  progress: number
  accuracy: number
  wpm: number
  elapsedTime: number
  handleInputChange: (input: string) => void
  reset: () => void
  start: () => void
  onDismiss: () => void
  isLoading: boolean
  error: Error | null
}

export function useTypingGame({
  targetCode,
  gameState,
  onComplete,
  maxConsecutiveErrors = 3,
}: UseTypingGameProps): UseTypingGameReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const gameInstanceRef = useRef<TypedTypingGame | null>(null)

  const [stats, setStats] = useState<GameStats>({
    progress: 0,
    accuracy: 100,
    wpm: 0,
    elapsed_time: 0,
    total_errors: 0,
    consecutive_errors: 0,
    show_error_alert: false,
    is_complete: false,
  })

  const [rawUserInput, setRawUserInput] = useState("")
  const [targetUnits, setTargetUnits] = useState<Array<CanonicalUnit>>([])
  const [userUnits, setUserUnits] = useState<Array<CanonicalUnit>>([])
  const [displayMap, setDisplayMap] = useState<Array<number>>([])

  // Initialize WASM and game instance
  useEffect(() => {
    let mounted = true

    const initWasm = async () => {
      try {
        setIsLoading(true)
        setError(null)
        await loadWasm()

        if (!mounted) return

        const game = new TypedTypingGame(targetCode, maxConsecutiveErrors)
        gameInstanceRef.current = game

        // Initialize canonical units & display map
        const units = canonicalizeText(targetCode)
        const map = buildDisplayMap(targetCode)

        setTargetUnits(units)
        setDisplayMap(map)
        setIsLoading(false)
      } catch (err) {
        if (!mounted) return
        setError(
          err instanceof Error ? err : new Error("Failed to initialize WASM")
        )
        setIsLoading(false)
      }
    }

    initWasm()
    return () => {
      mounted = false
      if (gameInstanceRef.current) {
        gameInstanceRef.current.free()
        gameInstanceRef.current = null
      }
    }
  }, [targetCode, maxConsecutiveErrors])

  // Periodic stats update
  useEffect(() => {
    if (gameState !== "playing" || !gameInstanceRef.current) return
    const interval = setInterval(() => {
      if (gameInstanceRef.current) {
        setStats(gameInstanceRef.current.getStats(Date.now()))
      }
    }, 100)
    return () => clearInterval(interval)
  }, [gameState])

  const handleInputChange = useCallback(
    (input: string) => {
      if (gameState !== "playing" || !gameInstanceRef.current) return
      try {
        const result: InputResult = gameInstanceRef.current.handleInput(input)

        if (result.accepted) {
          setRawUserInput(input)
          const newUserUnits = gameInstanceRef.current.getUserUnits()
          setUserUnits(newUserUnits)

          // Refresh display map for cursor-aware rendering
          const newDisplayMap = buildDisplayMap(input)
          setDisplayMap(newDisplayMap)

          setStats(gameInstanceRef.current.getStats(Date.now()))
        }
      } catch (err) {
        console.error("Error handling input:", err)
      }
    },
    [gameState]
  )

  const reset = useCallback(() => {
    if (!gameInstanceRef.current) return
    gameInstanceRef.current.reset()
    setRawUserInput("")
    setUserUnits([])
    setDisplayMap([])
    setStats({
      progress: 0,
      accuracy: 100,
      wpm: 0,
      elapsed_time: 0,
      total_errors: 0,
      consecutive_errors: 0,
      show_error_alert: false,
      is_complete: false,
    })
  }, [])

  const start = useCallback(() => {
    if (!gameInstanceRef.current) return
    gameInstanceRef.current.start(Date.now())
    setRawUserInput("")
    setUserUnits([])
    setDisplayMap([])
    setStats({
      progress: 0,
      accuracy: 100,
      wpm: 0,
      elapsed_time: 0,
      total_errors: 0,
      consecutive_errors: 0,
      show_error_alert: false,
      is_complete: false,
    })
  }, [])

  const onDismiss = useCallback(() => {
    setStats((prev) => ({ ...prev, show_error_alert: false }))
  }, [])

  // Check for completion
  useEffect(() => {
    if (
      gameState === "playing" &&
      userUnits.length > 0 &&
      targetUnits.length > 0 &&
      userUnits.length === targetUnits.length
    ) {
      const allMatch = userUnits.every((unit, i) => {
        const target = targetUnits[i]
        return (
          unit.kind === target.kind &&
          (unit.kind !== "char" || unit.value === target.value)
        )
      })
      if (allMatch) onComplete()
    }
  }, [userUnits, targetUnits, gameState, onComplete])

  return {
    userInput: rawUserInput,
    rawUserInput,
    displayCode: targetCode,
    targetUnits,
    userUnits,
    cursorUnitIndex: stats.cursor,
    displayMap,
    errors: stats.total_errors,
    consecutiveErrors: stats.consecutive_errors,
    showErrorAlert: stats.show_error_alert,
    progress: stats.progress,
    accuracy: stats.accuracy,
    wpm: stats.wpm,
    elapsedTime: stats.elapsed_time,
    handleInputChange,
    reset,
    start,
    onDismiss,
    isLoading,
    error,
  }
}
