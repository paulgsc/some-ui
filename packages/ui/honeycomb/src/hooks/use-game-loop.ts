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
}

export const useGameLoop = ({
  gameBridge,
  isInitialized,
  isPaused,
  setActiveCharacters,
  setStats,
  setTimingParams,
  playSound,
}: UseGameLoopProps) => {
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const spawnCharacter = useCallback(() => {
    if (!gameBridge) return

    const char = gameBridge.spawnCharacter()
    if (!char) return // Grid full

    if (char.playSpawnSound) {
      playSound("character_spawn")
    }

    setActiveCharacters((prev) => {
      const next = new Map(prev)
      next.set(char.cellId, {
        ...char,
        timeRemaining: 1,
      })
      return next
    })

    setTimingParams(gameBridge.getTimingParams())
  }, [gameBridge, setActiveCharacters, setTimingParams])

  const updateCharacters = useCallback(() => {
    if (!gameBridge) return

    const expiredResult = gameBridge.checkExpired()
    if (expiredResult.playExpireSound) {
      playSound("character_expire")
    }
    const now = Date.now()
    const currentWindow = gameBridge.getCurrentTimeWindow()

    setActiveCharacters((prev) => {
      const next = new Map(prev)

      // Remove expired
      expiredResult.cellIds.forEach((cellId) => next.delete(cellId))

      // Update time remaining for active
      next.forEach((char, cellId) => {
        const age = now - char.spawnedAt
        const timeRemaining = Math.max(0, 1 - age / currentWindow)
        next.set(cellId, { ...char, timeRemaining })
      })

      return next
    })

    if (expiredResult.count > 0) {
      setStats(gameBridge.getStats())
      setTimingParams(gameBridge.getTimingParams())
    }

    gameBridge.updateStatus()
  }, [gameBridge, setActiveCharacters, setStats, setTimingParams])

  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    spawnTimerRef.current = setInterval(
      spawnCharacter,
      gameBridge.getTimingParams().spawnIntervalMs
    )

    return (): void => clearInterval(spawnTimerRef.current!)
  }, [spawnCharacter, isPaused, gameBridge, isInitialized])

  // Update timer
  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    updateTimerRef.current = setInterval(updateCharacters, 50)

    return () => {
      if (updateTimerRef.current) clearInterval(updateTimerRef.current)
    }
  }, [updateCharacters, isPaused, gameBridge, isInitialized])
}
