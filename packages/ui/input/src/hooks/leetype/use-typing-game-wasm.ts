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
  TypedTypingGame as TypedTypingGameType,
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
  const gameRef = useRef<TypedTypingGameType | null>(null)
  const completedRef = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [rawUserInput, setRawUserInput] = useState("")
  const [userUnits, setUserUnits] = useState<Array<CanonicalUnit>>([])
  const [targetUnits, setTargetUnits] = useState<Array<CanonicalUnit>>([])

  const store = useMemo(() => createTypingGameStore(gameRef), [])

  useEffect(() => {
    const aliveRef = { current: true }

    ;(async (): Promise<void> => {
      try {
        setIsLoading(true)
        setError(null)

        await loadWasm()
        if (!aliveRef.current) return

        const game = new TypedTypingGame(
          targetCode,
          maxConsecutiveErrors
        ) as unknown as TypedTypingGameType
        gameRef.current = game
        completedRef.current = false

        setTargetUnits(canonicalizeText(targetCode))
        setIsLoading(false)
      } catch (e) {
        if (!aliveRef.current) return
        setError(e instanceof Error ? e : new Error("WASM init failed"))
        setIsLoading(false)
      }
    })()

    return (): void => {
      aliveRef.current = false
      gameRef.current?.free()
      gameRef.current = null
    }
  }, [maxConsecutiveErrors])

  useEffect(() => {
    const game = gameRef.current
    if (!game || !targetCode || isLoading) return

    try {
      game.startNextChunk(targetCode)
      setTargetUnits(canonicalizeText(targetCode))
      setRawUserInput("")
      setUserUnits([])
      completedRef.current = false
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Chunk transition failed"))
    }
  }, [targetCode, isLoading])

  const stats = store.useStats()

  const displayMap = useMemo(() => {
    if (!isWasmLoaded()) return []
    return deriveDisplayMap(rawUserInput)
  }, [rawUserInput])

  const cursorUnitIndex = stats ? deriveCursorIndex(stats) : 0

  const handleInputChange = useCallback(
    (input: string): void => {
      const game = gameRef.current
      if (!game || gameState !== "playing") return

      const result: InputResult = game.handleInput(input)
      if (!result.accepted) return

      setRawUserInput(input)
      setUserUnits(game.getUserUnits())
    },
    [gameState]
  )

  const resetInternal = (): void => {
    completedRef.current = false
    setRawUserInput("")
    setUserUnits([])
  }

  const reset = useCallback((): void => {
    gameRef.current?.reset()
    resetInternal()
  }, [])

  const start = useCallback((): void => {
    gameRef.current?.start(Date.now())
    resetInternal()
  }, [])

  const onDismiss = useCallback((): void => {
    gameRef.current?.dismissError()
  }, [])

  useEffect(() => {
    if (
      completedRef.current ||
      gameState !== "playing" ||
      !stats ||
      userUnits.length !== targetUnits.length
    ) {
      return
    }

    for (let i = 0; i < targetUnits.length; i++) {
      const u = userUnits[i] as CanonicalUnit
      const t = targetUnits[i] as CanonicalUnit
      if (
        u.kind !== t.kind ||
        (u.kind === "char" && t.kind === "char" && u.value !== t.value)
      ) {
        return
      }
    }

    completedRef.current = true

    const game = gameRef.current
    if (game && onChunkComplete) {
      const chunkStats = game.completeChunk(Date.now())
      onChunkComplete(chunkStats)
    }

    onComplete()
  }, [userUnits, targetUnits, stats, gameState, onComplete, onChunkComplete])

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
