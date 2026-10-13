import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
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
  /** The current step's source. */
  targetCode: string
  gameState: GameState
  /**
   * Identity of the step in flight.
   *
   * Explicit rather than inferred from `targetCode`, because two different
   * steps are allowed to carry the same source — a corpus can repeat a proof
   * — and inferring identity from the string would leave the engine holding
   * a finished step forever, with nothing to tell it a new one had started.
   */
  stepKey: string
  /**
   * Zero-based. Increasing it *without* changing `stepKey` is the gate
   * holding: the engine replays the same source as a further attempt, which
   * shortens the reveal delay.
   */
  attempt?: number
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
type GameView = {
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
  /**
   * One keystroke, or `null` when nothing is playing. The keystroke that
   * finishes the step also folds it into the session totals, and its
   * outcome carries that fold's `chunk`; every other outcome's is `null`.
   */
  press: (key: string) => Outcome | null
  backspace: () => void
  reset: () => void
  start: () => void
  onDismiss: () => void
  /**
   * Flip the manual-reveal override — see `TypedTypingGame.toggleReveal`.
   * Gated on `gameState === "playing"` the same as `press`/`backspace`,
   * since freezing the auto-hide loop is only meaningful while a step is
   * actually in flight.
   */
  toggleReveal: () => void
  /**
   * Always `"advance"`.
   *
   * The engine still computes weighted WPM against a baseline — `snapshot`
   * keeps `weightedWpm`/`gateThreshold` for the production probe — but its
   * `.progression()` verdict is no longer read here: under Axiom 9.1,
   * revelation is unconditional, so nothing a step's outcome does may be
   * gated on how fast it was typed.
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

const EMPTY_LAYOUT: Layout = {
  displayLen: 0,
  slotCount: 0,
  sections: [],
  displaySource: "",
}

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
  manualRevealActive: false,
  manualRevealFraction: 0,
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

/** Everything the hook renders from, published together. */
type EngineState = {
  view: GameView
  rejection: Rejection | null
  isLoading: boolean
  error: Error | null
}

type EngineStore = {
  subscribe: (listener: () => void) => () => void
  read: () => EngineState
  publish: (next: Partial<EngineState>) => void
}

/**
 * What the engine last produced, as a store React reads with
 * `useSyncExternalStore`: the engine changes on commands, timers and step
 * changes, not on renders, so its state is published from where it changes.
 */
function createEngineStore(): EngineStore {
  let current: EngineState = {
    view: EMPTY_VIEW,
    rejection: null,
    isLoading: true,
    error: null,
  }
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    read: (): EngineState => current,
    publish: (next): void => {
      current = { ...current, ...next }
      listeners.forEach((listener) => listener())
    },
  }
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

/** How a step is identified across the boundary: which one, and which try. */
function tokenOf(stepKey: string, attempt: number): string {
  return `${stepKey}#${attempt}`
}

export function useTypingGame({
  targetCode,
  gameState,
  stepKey,
  attempt = 0,
  initialBaseline,
  maxConsecutiveErrors = 3,
}: UseTypingGameProps): UseTypingGameReturn {
  const gameRef = useRef<TypedTypingGameType | null>(null)
  /** Whether the step in flight has been folded into the totals. */
  const completedRef = useRef(false)
  /** The `stepKey#attempt` the engine is compiled for. */
  const activeStepRef = useRef<string | null>(null)
  /** The previous step's identity, to tell a repeat from an advance. */
  const previousKeyRef = useRef<string | null>(null)

  const [store] = useState(createEngineStore)
  const { view, rejection, isLoading, error } = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.read
  )

  // Reads the step and baseline current when the wasm finishes loading,
  // without making either a reason to reload it: a later step reaches the
  // engine through the step effect below, a later baseline via `calibrate`.
  const construct = useEffectEvent((): TypedTypingGameType => {
    const game = new TypedTypingGame(
      targetCode,
      maxConsecutiveErrors,
      initialBaseline?.wpm,
      initialBaseline?.dispersion
    )
    activeStepRef.current = tokenOf(stepKey, attempt)
    previousKeyRef.current = stepKey
    return game
  })

  useEffect(() => {
    const aliveRef = { current: true }

    void (async (): Promise<void> => {
      try {
        store.publish({ isLoading: true, error: null })

        await loadWasm()
        if (!aliveRef.current) return

        const game = construct()
        gameRef.current = game
        completedRef.current = false
        store.publish({ view: readView(game, Date.now()), isLoading: false })
      } catch (e) {
        if (!aliveRef.current) return
        store.publish({
          error: e instanceof Error ? e : new Error("WASM init failed"),
          isLoading: false,
        })
      }
    })()

    return (): void => {
      aliveRef.current = false
      gameRef.current?.free()
      gameRef.current = null
    }
  }, [store, maxConsecutiveErrors])

  // Tells the engine which step is in flight: it holds one at a time.
  useEffect(() => {
    const game = gameRef.current
    if (!game || !targetCode || isLoading) return

    const token = tokenOf(stepKey, attempt)
    if (activeStepRef.current === token) return

    try {
      const now = Date.now()
      // Same step, later attempt: the gate held, so the engine replays the
      // source it already has rather than being handed a "new" one — which
      // is what keeps the attempt counter (and the shortened reveal delay)
      // meaningful. A different step is a swap.
      if (previousKeyRef.current === stepKey) {
        game.retryChunk(now)
      } else {
        game.startNextChunk(targetCode, now)
      }

      activeStepRef.current = token
      previousKeyRef.current = stepKey
      completedRef.current = false
      store.publish({ view: readView(game, Date.now()), rejection: null })
    } catch (e) {
      store.publish({
        error: e instanceof Error ? e : new Error("Step transition failed"),
      })
    }
  }, [store, targetCode, stepKey, attempt, isLoading])

  /**
   * Run one engine command and publish what it produced. The engine hands
   * back the outcome and the fresh snapshot together, so there is no window
   * where the caret and the highlighting disagree. The command that finishes
   * the step folds it into the totals here, once.
   */
  const dispatch = useCallback(
    (
      command: (game: TypedTypingGameType, now: number) => Outcome
    ): Outcome | null => {
      const game = gameRef.current
      if (!game) return null

      const outcome = command(game, Date.now())
      let result = outcome
      if (outcome.snapshot.isComplete && !completedRef.current) {
        completedRef.current = true
        result = { ...outcome, chunk: game.completeChunk(Date.now()).chunk }
      }
      store.publish({
        view: refreshView(store.read().view, game),
        rejection: outcome.rejection,
      })
      return result
    },
    [store]
  )

  const press = useCallback(
    (key: string): Outcome | null => {
      if (gameState !== "playing") return null
      return dispatch((game, now) => game.press(key, now))
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

  const toggleReveal = useCallback((): void => {
    if (gameState !== "playing") return
    dispatch((game, now) => game.toggleReveal(now))
  }, [dispatch, gameState])

  // Ax. 9.1: revelation is unconditional. The engine's own gate verdict
  // (`.progression()`) is intentionally never consulted here — see
  // `UseTypingGameReturn.readProgression`'s doc comment.
  const readProgression = useCallback((): Progression => "advance", [])

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

  return {
    ...view,
    rejection,
    press,
    backspace,
    reset,
    start,
    onDismiss,
    toggleReveal,
    readProgression,
    calibrate,
    isLoading,
    error,
  }
}
