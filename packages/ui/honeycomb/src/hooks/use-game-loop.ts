import { useCallback, useEffect, useRef } from "react"
import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import type {
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { CharacterWithLifetime } from "@honeycomb/types/hangul-types"

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
}: UseGameLoopProps) => {
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null)
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null)

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

  // ====================================================================
  // SPAWN CHARACTER
  // ====================================================================
  const spawnCharacter = useCallback(() => {
    const bridge = gameBridgeRef.current
    if (!bridge) return

    const events = bridge.spawnCharacter()

    events.forEach((event) => {
      switch (event.type) {
        case "characterSpawned": {
          const char = bridge.createDisplayCharacter(event.spawnResult)

          if (event.spawnResult.playSpawnSound) {
            playSoundRef.current("character_spawn")
          }

          setActiveCharactersRef.current((prev) => {
            const next = new Map(prev)
            next.set(char.cellId, { ...char, timeRemaining: 1 })
            return next
          })

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
          event satisfies never
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
      switch (event.type) {
        case "charactersExpired":
          if (event.count > 0) playSoundRef.current("character_expire")
          setActiveCharactersRef.current((prev) => {
            const next = new Map(prev)
            event.cellIds.forEach((id) => next.delete(id))
            return next
          })
          break
        case "statsUpdated":
          setStatsRef.current({
            ...event.stats,
            accuracy: calculateAccuracy(event.stats),
          })
          break
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
        case "streakMilestone": {
          // These are handled in:
          // - spawn loop
          // - input handler
          // - scoring / UI layers
          break
        }
        default: {
          event satisfies never
        }
      }
    })

    // Update timeRemaining for active characters
    setActiveCharactersRef.current((prev) => {
      const next = new Map(prev)
      next.forEach((char, cellId) => {
        const age = now - char.spawnedAt
        next.set(cellId, {
          ...char,
          timeRemaining: Math.max(0, 1 - age / currentWindow),
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
  }, [isInitialized, gameBridge, spawnCharacter, updateCharacters])
}

// ====================================================================
// HELPERS
// ====================================================================

function calculateAccuracy(stats: GameStats): number {
  const total = stats.totalCorrect + stats.totalMissed
  return total === 0 ? 0 : (stats.totalCorrect / total) * 100
}
