import { useCallback, useEffect, useRef } from "react"
import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import type {
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  WordProgress,
} from "@honeycomb/types/hangul-types"
import { assertNever } from "@honeycomb/utils/error"

type UseGameLoopProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  setActiveCharacters: React.Dispatch<
    React.SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: React.Dispatch<
    React.SetStateAction<GameStats & { accuracy: number }>
  >
  setTimingParams: React.Dispatch<React.SetStateAction<TimingParams>>
  playSound: (event: AudioEvent) => void
  onBoardFull?: () => void
  /** Tracks the currently in-progress multi-token challenge, if any (#426). */
  setWordProgress?: React.Dispatch<React.SetStateAction<WordProgress | null>>
  /** Misses observed since the tracked word spawned, for #762's hint escalation. */
  setMissCount?: React.Dispatch<React.SetStateAction<number>>
}

export const useGameLoop = ({
  gameBridge,
  isInitialized,
  isPaused,
  setActiveCharacters,
  setStats,
  setTimingParams,
  playSound,
  onBoardFull,
  setWordProgress,
  setMissCount,
}: UseGameLoopProps): void => {
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ====================================================================
  // Stable refs to callbacks (avoid recreating intervals)
  // ====================================================================

  const gameBridgeRef = useRef(gameBridge)
  const isPausedRef = useRef(isPaused)
  const setActiveCharactersRef = useRef(setActiveCharacters)
  const setStatsRef = useRef(setStats)
  const setTimingParamsRef = useRef(setTimingParams)
  const playSoundRef = useRef(playSound)
  const onBoardFullRef = useRef(onBoardFull)
  const setWordProgressRef = useRef(setWordProgress)
  const setMissCountRef = useRef(setMissCount)
  const wordProgressCellIdsRef = useRef<Array<string>>([])

  useEffect(() => {
    gameBridgeRef.current = gameBridge
  }, [gameBridge])
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])
  useEffect(() => {
    setActiveCharactersRef.current = setActiveCharacters
  }, [setActiveCharacters])
  useEffect(() => {
    setStatsRef.current = setStats
  }, [setStats])
  useEffect(() => {
    setTimingParamsRef.current = setTimingParams
  }, [setTimingParams])
  useEffect(() => {
    playSoundRef.current = playSound
  }, [playSound])
  useEffect(() => {
    onBoardFullRef.current = onBoardFull
  }, [onBoardFull])
  useEffect(() => {
    setWordProgressRef.current = setWordProgress
  }, [setWordProgress])
  useEffect(() => {
    setMissCountRef.current = setMissCount
  }, [setMissCount])

  // ====================================================================
  // SPAWN CHARACTER
  // ====================================================================
  const spawnCharacter = useCallback(() => {
    const bridge = gameBridgeRef.current
    if (!bridge) return

    const events = bridge.spawnCharacter()

    events.forEach((event) => {
      const { type: t } = event
      switch (t) {
        case "characterSpawned": {
          const chars = bridge.createDisplayCharacters(event.spawnResult)

          if (event.spawnResult.playSpawnSound) {
            playSoundRef.current("character_spawn")
          }

          setActiveCharactersRef.current((prev) => {
            const next = new Map(prev)
            chars.forEach((char) => {
              next.set(char.cellId, { ...char, timeRemaining: 1 })
            })
            return next
          })

          // Track a newly spawned word challenge for the masked-word overlay
          // (#426). A single-jamo (n=1) spawn is intentionally not tracked -
          // WordProgressOverlay itself no-ops below answerGlyphs.length > 1.
          if (event.spawnResult.answerGlyphs.length > 1) {
            wordProgressCellIdsRef.current = event.spawnResult.cellIds
            setWordProgressRef.current?.({
              cellIds: event.spawnResult.cellIds,
              answerGlyphs: event.spawnResult.answerGlyphs,
              cursor: 0,
            })
            setMissCountRef.current?.(0)
          }

          const timing = bridge.getTimingParams()
          setTimingParamsRef.current(timing)
          break
        }

        case "boardFull": {
          onBoardFullRef.current?.()
          break
        }
        case "difficultyChanged": {
          playSoundRef.current("difficulty_increase")
          setTimingParamsRef.current(bridge.getTimingParams())
          break
        }

        case "matchFound":
        case "inputMissed":
        case "ambiguousInput":
        case "answerProgress":
        case "bufferUpdated":
        case "streakMilestone":
        case "statsUpdated":
        case "charactersExpired": {
          // These events are intentionally handled in:
          // - input handling
          // - updateCharacters loop
          // - scoring / stats effects
          //
          // Spawn loop must remain side-effect minimal.
          break
        }

        default: {
          t satisfies never
          assertNever(t)
        }
      }
    })
  }, [])

  // ====================================================================
  // UPDATE CHARACTERS
  // ====================================================================

  const updateCharacters = useCallback(() => {
    const bridge = gameBridgeRef.current
    if (!bridge) return

    const events = bridge.checkExpired()
    const now = Date.now()
    const currentWindow = bridge.getCurrentTimeWindow()

    events.forEach((event) => {
      const { type: t } = event
      switch (t) {
        case "charactersExpired": {
          if (event.count > 0) playSoundRef.current("character_expire")
          setActiveCharactersRef.current((prev) => {
            const next = new Map(prev)
            event.cellIds.forEach((id) => next.delete(id))
            return next
          })

          // If the word the overlay is currently tracking just expired,
          // clear it rather than leaving a stale masked word on screen.
          if (
            wordProgressCellIdsRef.current.some((id) =>
              event.cellIds.includes(id)
            )
          ) {
            wordProgressCellIdsRef.current = []
            setWordProgressRef.current?.(null)
          }
          break
        }
        case "statsUpdated": {
          setStatsRef.current({
            ...event.stats,
            accuracy: calculateAccuracy(event.stats),
          })
          break
        }
        case "difficultyChanged": {
          setTimingParamsRef.current(bridge.getTimingParams())
          break
        }
        case "characterSpawned":
        case "boardFull":
        case "matchFound":
        case "inputMissed":
        case "bufferUpdated":
        case "ambiguousInput":
        case "answerProgress":
        case "streakMilestone": {
          // These are handled in:
          // - spawn loop
          // - input handler
          // - scoring / UI layers
          break
        }
        default: {
          t satisfies never
          assertNever(t)
        }
      }
    })

    // Update timeRemaining for active characters. Solved characters are locked
    // into their cell and no longer count down. The engine's budget is
    // per-*token* (revealed_at_ms + answerKeys.length * currentWindow, canon
    // Thm. 7.2/ADR 0003 §2(a)'s shared word countdown) - a single-jamo (n=1)
    // cell's budget is unchanged since answerKeys.length is 1 there.
    setActiveCharactersRef.current((prev) => {
      const next = new Map(prev)
      next.forEach((char, cellId) => {
        if (char.isSolved) return
        const age = now - char.spawnedAt
        const tokenCount = char.answerKeys.length || 1
        next.set(cellId, {
          ...char,
          timeRemaining: Math.max(0, 1 - age / (currentWindow * tokenCount)),
        })
      })
      return next
    })

    bridge.updateStatus()
  }, [])

  // ====================================================================
  // INTERVAL EFFECT
  // ====================================================================

  useEffect(() => {
    if (!isInitialized || !gameBridge || isPaused) return

    const spawnInterval = gameBridge.getTimingParams().spawnIntervalMs
    spawnTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) spawnCharacter()
    }, spawnInterval)

    updateTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) updateCharacters()
    }, 50)

    return (): void => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current)
      if (updateTimerRef.current) clearInterval(updateTimerRef.current)
    }
  }, [isInitialized, gameBridge, spawnCharacter, updateCharacters, isPaused])
}

// ====================================================================
// HELPERS
// ====================================================================

function calculateAccuracy(stats: GameStats): number {
  const total = stats.totalCorrect + stats.totalMissed
  return total === 0 ? 0 : (stats.totalCorrect / total) * 100
}
