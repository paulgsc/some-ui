import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ViewportConfig,
  WasmTransition,
  WasmViewportState,
} from "some-types-utils"
import { TransitionFactory } from "some-types-utils"

import type { Viewport } from "./viewport"
import { ViewportEngine } from "./viewport-engine"
import { getViewportManager } from "./viewport-manager"

export type UseViewportOptions = {
  autoTick?: boolean
  tickIntervalMs?: number
  autoRefresh?: boolean
  onFaceChange?: (newFace: number, oldFace: number) => void
  onContentAdvance?: (newCursor: number, oldCursor: number) => void
}

export type FaceContent<T = any> = {
  faceIndex: number
  contentIndices: Array<number>
  isActive: boolean
  mapContent?: (index: number) => T
}

export type UseViewportResult = {
  viewport: Viewport | null
  state: WasmViewportState | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  faces: Array<FaceContent>
  activeFace: number
  cursor: number
  progress: number
  transition: (transition: WasmTransition) => Promise<void>
  nextItem: () => Promise<void>
  rotateNext: () => Promise<void>
  rotatePrev: () => Promise<void>
  jumpToFace: (face: number) => Promise<void>
  switchCycle: (index: number) => Promise<void>
  jumpToContent: (index: number) => Promise<void>
  tick: (dtMs: number) => Promise<void>
  pause: () => void
  resume: () => void
  isPaused: boolean
  refreshState: () => Promise<void>
  reload: () => Promise<void>
}

/**
 * Enhanced viewport hook with auto-tick and face content mapping
 * Refactored to use Core Engine pattern for stability
 */
export function useViewport(
  config: ViewportConfig,
  options: UseViewportOptions = {}
): UseViewportResult {
  const { autoTick = false, tickIntervalMs = 100, autoRefresh = true } = options

  const [state, setState] = useState<WasmViewportState | null>(null)
  const [engine, setEngine] = useState<ViewportEngine | null>(null)
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Store options in ref to avoid recreating engine on callback changes
  const viewportRef = useRef<Viewport | null>(null)
  const engineRef = useRef<ViewportEngine | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Initialize engine (only on config.id change)
  useEffect(() => {
    let mounted = true
    let eng: ViewportEngine | null = null

    const initEngine = async (): Promise<void> => {
      try {
        setIsLoading(true)
        setError(null)

        const manager = getViewportManager()
        const vp = await manager.getOrCreateViewport(config)

        if (!mounted) return

        // Create engine with event callbacks
        eng = new ViewportEngine(vp, {
          onState: setState,
          onFaceChange: optionsRef.current.onFaceChange,
          onContentAdvance: optionsRef.current.onContentAdvance,
          onError: setError,
        })

        // Store in refs for cleanup
        viewportRef.current = vp
        engineRef.current = eng

        setViewport(vp)
        setEngine(eng)

        // Get initial state
        if (autoRefresh) {
          await eng.refreshState()
        } else {
          const currentState = vp.getState()
          if (currentState) {
            setState(currentState)
          }
        }

        // Start auto-tick if enabled
        if (autoTick) {
          eng.startAutoTick(tickIntervalMs)
        }

        setIsInitialized(true)
        setIsLoading(false)
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
          setIsLoading(false)
          // eslint-disable-next-line no-console
          console.error("useViewport initialization failed:", message)
        }
      }
    }

    initEngine()

    return (): void => {
      mounted = false

      const eng = engineRef.current
      const vp = viewportRef.current

      if (eng) {
        eng.dispose()
        engineRef.current = null
      }

      if (vp) {
        const manager = getViewportManager()
        manager.removeViewport(vp.getId())
        viewportRef.current = null
      }
    }
  }, [config.id, autoRefresh, autoTick, tickIntervalMs])

  // Update engine callbacks when they change (without recreating engine)
  useEffect(() => {
    engine?.updateEvents({
      onFaceChange: options.onFaceChange,
      onContentAdvance: options.onContentAdvance,
    })
  }, [engine, options.onFaceChange, options.onContentAdvance])

  // Map state to face content (memoized for performance)
  const faces: Array<FaceContent> = state
    ? state.faceLayout.map((contentIndices, faceIndex) => ({
        faceIndex,
        contentIndices,
        isActive: faceIndex === state.activeFace,
      }))
    : []

  const activeFace = state?.activeFace ?? 0
  const cursor = state?.cursor ?? 0
  const progress = state?.progress ?? 0

  // Stable callback wrappers
  const transition = useCallback(
    async (trans: WasmTransition) => {
      await engine?.transition(trans)
    },
    [engine]
  )

  const nextItem = useCallback(async () => {
    await engine?.transition(TransitionFactory.nextItem())
  }, [engine])

  const rotateNext = useCallback(async () => {
    await engine?.transition(TransitionFactory.rotateNext())
  }, [engine])

  const rotatePrev = useCallback(async () => {
    await engine?.transition(TransitionFactory.rotatePrev())
  }, [engine])

  const jumpToFace = useCallback(
    async (face: number) => {
      await engine?.transition(TransitionFactory.jumpToFace(face))
    },
    [engine]
  )

  const switchCycle = useCallback(
    async (index: number) => {
      await engine?.transition(TransitionFactory.switchCycle(index))
    },
    [engine]
  )

  const jumpToContent = useCallback(
    async (index: number) => {
      await engine?.transition(TransitionFactory.jumpToContent(index))
    },
    [engine]
  )

  const tick = useCallback(
    async (dtMs: number) => {
      await engine?.tick(dtMs)
    },
    [engine]
  )

  const pause = useCallback(() => {
    engine?.pause()
    setIsPaused(true)
  }, [engine])

  const resume = useCallback(() => {
    engine?.resume()
    setIsPaused(false)
  }, [engine])

  const refreshState = useCallback(async () => {
    await engine?.refreshState()
  }, [engine])

  const reload = useCallback(async () => {
    if (!viewport) return

    try {
      setIsLoading(true)
      setError(null)

      const manager = getViewportManager()
      manager.removeViewport(viewport.getId())

      // Dispose old engine
      engine?.dispose()

      const newVp = await manager.getOrCreateViewport(config)
      const newEng = new ViewportEngine(newVp, {
        onState: setState,
        onFaceChange: optionsRef.current.onFaceChange,
        onContentAdvance: optionsRef.current.onContentAdvance,
        onError: setError,
      })

      setViewport(newVp)
      setEngine(newEng)

      const currentState = newVp.getState()
      if (currentState) {
        setState(currentState)
      }

      if (autoTick) {
        newEng.startAutoTick(tickIntervalMs)
      }

      setIsLoading(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setIsLoading(false)
    }
  }, [viewport, engine, config, autoTick, tickIntervalMs])

  return {
    viewport,
    state,
    isLoading,
    isInitialized,
    error,
    faces,
    activeFace,
    cursor,
    progress,
    transition,
    nextItem,
    rotateNext,
    rotatePrev,
    jumpToFace,
    switchCycle,
    jumpToContent,
    tick,
    pause,
    resume,
    isPaused,
    refreshState,
    reload,
  }
}
