import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createTypingGameStore } from "@input/lib/leetype/game-store"
import {
  canonicalizeText,
  isWasmLoaded,
  loadWasm,
  TypedTypingGame,
} from "@input/lib/leetype/leetype-wasm-loader"
import type {
  CanonicalUnit,
  ChunkCompletionStats,
  GameState,
  InputResult,
} from "@input/types/leetype"
import { deriveCursorIndex, deriveDisplayMap } from "@input/utils/leetype"

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
  onChunkComplete?: (stats: ChunkCompletionStats) => void
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
  onChunkComplete,
  maxConsecutiveErrors = 3,
}: UseTypingGameProps): UseTypingGameReturn {
  const gameRef = useRef<TypedTypingGame | null>(null)
  const completedRef = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [rawUserInput, setRawUserInput] = useState("")
  const [userUnits, setUserUnits] = useState<Array<CanonicalUnit>>([])
  const [targetUnits, setTargetUnits] = useState<Array<CanonicalUnit>>([])

  // Create store once - it will access gameRef.current dynamically
  const store = useMemo(() => createTypingGameStore(gameRef), [])

  /* ---------- INIT ---------- */

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        setIsLoading(true)
        setError(null)

        await loadWasm()
        if (!alive) return

        // Initialize game with initial target
        const game = new TypedTypingGame(targetCode, maxConsecutiveErrors)
        gameRef.current = game
        completedRef.current = false
        lastTargetRef.current = targetCode

        setTargetUnits(canonicalizeText(targetCode))
        setIsLoading(false)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e : new Error("WASM init failed"))
        setIsLoading(false)
      }
    })()

    return (): void => {
      alive = false
      gameRef.current?.free()
      gameRef.current = null
    }
  }, [maxConsecutiveErrors]) // Only reinit when max errors changes

  /* ----------- CHUNK TRANSITIONS ----------- */

  // When targetCode changes, it means a new chunk was loaded
  useEffect(() => {
    const game = gameRef.current
    if (!game || !targetCode || isLoading) return

    try {
      // Transition to new chunk
      game.startNextChunk(targetCode)
      setTargetUnits(canonicalizeText(targetCode))

      // Reset UI state for new chunk
      setRawUserInput("")
      setUserUnits([])
      completedRef.current = false
    } catch (e) {
      console.error("Failed to start next chunk:", e)
      setError(e instanceof Error ? e : new Error("Chunk transition failed"))
    }
  }, [targetCode, isLoading])

  /* ---------- STATS SUBSCRIPTION ---------- */

  // Always call the hook unconditionally
  // Store dynamically accesses gameRef.current
  const stats = store.useStats()

  /* ---------- DERIVED ---------- */

  // Guard displayMap derivation until WASM is loaded
  const displayMap = useMemo(() => {
    if (!isWasmLoaded()) return []
    return deriveDisplayMap(rawUserInput)
  }, [rawUserInput])

  const cursorUnitIndex = stats ? deriveCursorIndex(stats) : 0

  /* ---------- INPUT ---------- */

  const handleInputChange = useCallback(
    (input: string) => {
      const game = gameRef.current
      if (!game || gameState !== "playing") return

      const result: InputResult = game.handleInput(input)
      if (!result.accepted) return

      setRawUserInput(input)
      setUserUnits(game.getUserUnits())
      // stats update automatically via external store
    },
    [gameState]
  )

  /* ---------- CONTROL ---------- */

  const resetInternal = (): void => {
    completedRef.current = false
    setRawUserInput("")
    setUserUnits([])
  }

  const reset = useCallback(() => {
    gameRef.current?.reset()
    resetInternal()
  }, [])

  const start = useCallback(() => {
    gameRef.current?.start(Date.now())
    resetInternal()
  }, [])

  const onDismiss = useCallback(() => {
    gameRef.current?.dismissError()
  }, [])

  /* ---------- CHUNK COMPLETION ---------- */

  useEffect(() => {
    if (
      completedRef.current ||
      gameState !== "playing" ||
      !stats ||
      userUnits.length !== targetUnits.length
    ) {
      return
    }

    // Check if chunk is complete
    for (let i = 0; i < targetUnits.length; i++) {
      const u = userUnits[i]
      const t = targetUnits[i]
      if (u.kind !== t.kind || (u.kind === "char" && u.value !== t.value)) {
        return
      }
    }

    completedRef.current = true

    // Extract chunk stats before completing
    const game = gameRef.current
    if (game && onChunkComplete) {
      const chunkStats = game.completeChunk(Date.now())
      onChunkComplete(chunkStats)
    }

    onComplete()
  }, [userUnits, targetUnits, stats, gameState, onComplete, onChunkComplete])

  /* ---------- FALLBACK FOR LOADING STATE ---------- */

  if (!stats) {
    return {
      userInput: "",
      rawUserInput: "",
      displayCode: targetCode,
      targetUnits,
      userUnits: [],
      cursorUnitIndex: 0,
      displayMap: [],
      errors: 0,
      consecutiveErrors: 0,
      showErrorAlert: false,
      progress: 0,
      accuracy: 100,
      wpm: 0,
      elapsedTime: 0,
      handleInputChange,
      reset,
      start,
      onDismiss,
      isLoading,
      error,
    }
  }

  /* ---------- PUBLIC API ---------- */

  return {
    userInput: rawUserInput,
    rawUserInput,
    displayCode: targetCode,
    targetUnits,
    userUnits,
    cursorUnitIndex,
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
