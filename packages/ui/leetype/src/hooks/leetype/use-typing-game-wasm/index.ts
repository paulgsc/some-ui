import { useCallback, useEffect, useRef, useState } from "react"
import {
  loadWasm,
  TypedTypingGame,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type {
  ChunkCompletionStats,
  GameState,
  Layout,
  Outcome,
  Rejection,
  SectionProgress,
  Snapshot,
  TypedTypingGame as TypedTypingGameType,
} from "@leetype/types/leetype"

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
  onChunkComplete?: (stats: ChunkCompletionStats) => void
  maxConsecutiveErrors?: number
}

/**
 * Everything the renderer needs, read out of the engine in one go.
 *
 * `roles` and `slotOfDisplay` only change when the chunk does; `slotStatus`
 * and `snapshot` change on every accepted keystroke. They are grouped
 * because they must be read from the *same* engine state — a `slotStatus`
 * from before a keystroke paired with a `snapshot` from after it would put
 * the caret one character ahead of the highlighting.
 */
export type GameView = {
  layout: Layout
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  snapshot: Snapshot
}

type UseTypingGameReturn = GameView & {
  /** Per-section completion, read lazily for the skip/resume picker. */
  readSectionProgress: () => Array<SectionProgress>
  /** Why the last keystroke was refused, if it was. */
  rejection: Rejection | null
  press: (key: string) => void
  backspace: () => void
  jumpToSection: (section: number) => void
  resume: () => void
  reset: () => void
  start: () => void
  onDismiss: () => void
  isLoading: boolean
  error: Error | null
}

const EMPTY_LAYOUT: Layout = { displayLen: 0, slotCount: 0, sections: [] }

const EMPTY_SNAPSHOT: Snapshot = {
  cursorSlot: 0,
  cursorDisplay: 0,
  cursorSection: null,
  slotCount: 0,
  filled: 0,
  correct: 0,
  firstGapSlot: null,
  progress: 0,
  accuracy: 100,
  wpm: 0,
  elapsedTime: 0,
  totalErrors: 0,
  consecutiveErrors: 0,
  showErrorAlert: false,
  isComplete: false,
  started: false,
}

const EMPTY_VIEW: GameView = {
  layout: EMPTY_LAYOUT,
  roles: new Uint8Array(),
  slotOfDisplay: new Int32Array(),
  slotStatus: new Uint8Array(),
  snapshot: EMPTY_SNAPSHOT,
}

/** Read the whole render-facing view out of one engine state. */
function readView(game: TypedTypingGameType, now: number): GameView {
  return {
    layout: game.layout(),
    roles: game.roles(),
    slotOfDisplay: game.slotOfDisplay(),
    slotStatus: game.slotStatus(),
    snapshot: game.snapshot(now),
  }
}

/** The cheaper re-read after a keystroke: the chunk's structure is fixed. */
function refreshView(previous: GameView, game: TypedTypingGameType): GameView {
  return {
    ...previous,
    slotStatus: game.slotStatus(),
    snapshot: game.snapshot(Date.now()),
  }
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
  const [view, setView] = useState<GameView>(EMPTY_VIEW)
  const [rejection, setRejection] = useState<Rejection | null>(null)

  // Latest-ref: the mount effect below only wants targetCode's value *at
  // construction time* — it must not re-run (and reload wasm) on every
  // targetCode change, since the second effect already handles those via
  // startNextChunk. Reading through a ref keeps it out of that effect's
  // dependency array without going stale.
  const targetCodeRef = useRef(targetCode)
  useEffect(() => {
    targetCodeRef.current = targetCode
  })

  useEffect(() => {
    const aliveRef = { current: true }

    void (async (): Promise<void> => {
      try {
        setIsLoading(true)
        setError(null)

        await loadWasm()
        if (!aliveRef.current) return

        const game = new TypedTypingGame(
          targetCodeRef.current,
          maxConsecutiveErrors
        )
        gameRef.current = game
        completedRef.current = false

        setView(readView(game, Date.now()))
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
      game.startNextChunk(targetCode, Date.now())
      // Reacting to a prop change (targetCode) by resyncing local UI state
      // to match the engine's new chunk — the imperative startNextChunk
      // call above can't move to render (it must run exactly once per
      // change), so this can't be restructured as a render-time adjustment.
      setView(readView(game, Date.now()))
      setRejection(null)
      completedRef.current = false
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Chunk transition failed"))
    }
  }, [targetCode, isLoading])

  /**
   * Run one engine command and republish what it produced. The engine hands
   * back the outcome and the fresh snapshot together, so there is no window
   * where the caret and the highlighting disagree.
   */
  const dispatch = useCallback(
    (command: (game: TypedTypingGameType, now: number) => Outcome): void => {
      const game = gameRef.current
      if (!game) return

      const outcome = command(game, Date.now())
      setRejection(outcome.rejection)
      setView((previous) => refreshView(previous, game))
    },
    []
  )

  const press = useCallback(
    (key: string): void => {
      if (gameState !== "playing") return
      dispatch((game, now) => game.press(key, now))
    },
    [dispatch, gameState]
  )

  const backspace = useCallback((): void => {
    if (gameState !== "playing") return
    dispatch((game, now) => game.backspace(now))
  }, [dispatch, gameState])

  const jumpToSection = useCallback(
    (section: number): void => {
      dispatch((game, now) => game.jumpToSection(section, now))
    },
    [dispatch]
  )

  const resume = useCallback((): void => {
    dispatch((game, now) => game.resume(now))
  }, [dispatch])

  const reset = useCallback((): void => {
    completedRef.current = false
    dispatch((game, now) => game.reset(now))
  }, [dispatch])

  const start = useCallback((): void => {
    completedRef.current = false
    dispatch((game, now) => game.start(now))
  }, [dispatch])

  const onDismiss = useCallback((): void => {
    dispatch((game, now) => game.dismissAlert(now))
  }, [dispatch])

  const readSectionProgress = useCallback(
    (): Array<SectionProgress> => gameRef.current?.sectionProgress() ?? [],
    []
  )

  const { isComplete } = view.snapshot

  useEffect(() => {
    if (completedRef.current || gameState !== "playing" || !isComplete) return

    const game = gameRef.current
    if (!game) return

    completedRef.current = true

    const outcome = game.completeChunk(Date.now())
    if (outcome.chunk && onChunkComplete) {
      onChunkComplete(outcome.chunk)
    }

    onComplete()
  }, [isComplete, gameState, onComplete, onChunkComplete])

  return {
    ...view,
    readSectionProgress,
    rejection,
    press,
    backspace,
    jumpToSection,
    resume,
    reset,
    start,
    onDismiss,
    isLoading,
    error,
  }
}
