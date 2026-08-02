import { useCallback, useEffect, useRef, useState } from "react"
import type { Baseline } from "@leetype/lib/leetype/baseline-store"
import {
  loadWasm,
  TypedTypingGame,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type {
  GameState,
  Layout,
  Outcome,
  Progression,
  Rejection,
  Snapshot,
  TypedTypingGame as TypedTypingGameType,
} from "@leetype/types/leetype"

/**
 * How often the host pokes the engine while a step is in flight.
 *
 * The reveal loop is a controller whose most important input is a player who
 * has stopped typing, and a state machine driven only by keystrokes cannot
 * see one — `k` would freeze exactly when it most needs to open. 250ms is
 * well under the shortest reveal the loop can produce and far above anything
 * a person perceives as latency.
 */
const TICK_INTERVAL_MS = 250

type UseTypingGameProps = {
  /** The current step's source. Swapping it hands the engine the next step. */
  targetCode: string
  gameState: GameState
  /** Bumped to replay the same source as a fresh attempt (the gate held). */
  attemptKey?: number
  /**
   * The player's own sampled typing speed at construction time. Every
   * threshold the engine applies is a fraction of it; omitting it takes the
   * cold-start stand-in, which is playable.
   *
   * Later samples arrive through `calibrate`, not through this prop: a
   * baseline change must not tear the engine down, because that would reset
   * the session clock and the totals with it.
   */
  initialBaseline?: Baseline
  onComplete?: () => void
  maxConsecutiveErrors?: number
}

/**
 * Everything the renderer needs, read out of the engine in one go.
 *
 * `roles` and `slotOfDisplay` only change when the step does; `slotStatus`,
 * `visibility` and `snapshot` change on every accepted keystroke and on
 * every tick. They are grouped because they must be read from the *same*
 * engine state — a `slotStatus` from before a keystroke paired with a
 * `snapshot` from after it would put the caret one character ahead of the
 * highlighting.
 */
export type GameView = {
  layout: Layout
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
  snapshot: Snapshot
}

type UseTypingGameReturn = GameView & {
  /** Why the last keystroke was refused, if it was. */
  rejection: Rejection | null
  press: (key: string) => void
  backspace: () => void
  reset: () => void
  start: () => void
  onDismiss: () => void
  /**
   * What the engine makes of the step as typed — read at the moment the
   * runner asks, because weighted WPM is a rate and asking it about time the
   * player was not typing in would answer a different question.
   */
  readProgression: () => Progression
  /**
   * Re-derive every threshold from a fresh sample. A command to the engine,
   * which is the external system this hook exists to wrap.
   */
  calibrate: (baseline: Baseline) => void
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
  instantWpm: 0,
  weightedWpm: 0,
  gateThreshold: 0,
  attempt: 0,
  revealK: 0,
  runCount: 0,
  assisted: 0,
  elapsedTime: 0,
  sessionElapsedTime: 0,
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
  visibility: new Uint8Array(),
  snapshot: EMPTY_SNAPSHOT,
}

/** Read the whole render-facing view out of one engine state. */
function readView(game: TypedTypingGameType, now: number): GameView {
  return {
    layout: game.layout(),
    roles: game.roles(),
    slotOfDisplay: game.slotOfDisplay(),
    slotStatus: game.slotStatus(),
    visibility: game.visibility(),
    snapshot: game.snapshot(now),
  }
}

/** The cheaper re-read after a command: the step's structure is fixed. */
function refreshView(previous: GameView, game: TypedTypingGameType): GameView {
  const now = Date.now()
  return {
    ...previous,
    slotStatus: game.slotStatus(),
    visibility: game.visibility(),
    snapshot: game.snapshot(now),
  }
}

export function useTypingGame({
  targetCode,
  gameState,
  attemptKey = 0,
  initialBaseline,
  onComplete,
  maxConsecutiveErrors = 3,
}: UseTypingGameProps): UseTypingGameReturn {
  const gameRef = useRef<TypedTypingGameType | null>(null)
  const completedRef = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [view, setView] = useState<GameView>(EMPTY_VIEW)
  const [rejection, setRejection] = useState<Rejection | null>(null)

  // Latest-ref: the mount effect below only wants these values *at
  // construction time* — it must not re-run (and reload wasm) whenever the
  // step changes, since the effects below already handle those.
  const targetCodeRef = useRef(targetCode)
  const baselineRef = useRef(initialBaseline)
  useEffect(() => {
    targetCodeRef.current = targetCode
    baselineRef.current = initialBaseline
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
          maxConsecutiveErrors,
          baselineRef.current?.wpm,
          baselineRef.current?.dispersion
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
      const now = Date.now()
      // `attemptKey` moving with the same source is the gate holding: the
      // engine replays it as a further attempt, which shortens the initial
      // delay. A new source is the next step.
      if (attemptKey > 0 && game.snapshot(now).attempt < attemptKey) {
        game.retryChunk(now)
      } else {
        game.startNextChunk(targetCode, now)
      }
      // Reacting to a prop change by resyncing local UI state to match the
      // engine's new step — the imperative call above can't move to render
      // (it must run exactly once per change), so this can't be
      // restructured as a render-time adjustment.
      setView(readView(game, Date.now()))
      setRejection(null)
      completedRef.current = false
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Step transition failed"))
    }
  }, [targetCode, attemptKey, isLoading])

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

  const readProgression = useCallback(
    (): Progression => gameRef.current?.progression(Date.now()) ?? "advance",
    []
  )

  const calibrate = useCallback((baseline: Baseline): void => {
    gameRef.current?.calibrate(baseline.wpm, baseline.dispersion, Date.now())
  }, [])

  // The tick. Only while a step is genuinely in flight: a finished or
  // not-yet-started step has no window to open.
  const { isComplete } = view.snapshot
  useEffect(() => {
    if (gameState !== "playing" || isComplete || isLoading) return

    const interval = setInterval(() => {
      dispatch((game, now) => game.tick(now))
    }, TICK_INTERVAL_MS)

    return (): void => {
      clearInterval(interval)
    }
  }, [gameState, isComplete, isLoading, dispatch])

  useEffect(() => {
    if (completedRef.current || gameState !== "playing" || !isComplete) return

    const game = gameRef.current
    if (!game) return

    completedRef.current = true
    game.completeChunk(Date.now())
    onComplete?.()
  }, [isComplete, gameState, onComplete])

  return {
    ...view,
    rejection,
    press,
    backspace,
    reset,
    start,
    onDismiss,
    readProgression,
    calibrate,
    isLoading,
    error,
  }
}
