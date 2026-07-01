import { useEffect } from "react"
import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import type { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameEvent,
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { CharacterWithLifetime } from "@honeycomb/types/hangul-types"

type UseKeyboardInputProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  keyboardManager: KeyboardInputManager
  setActiveCharacters: React.Dispatch<
    React.SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: React.Dispatch<
    React.SetStateAction<GameStats & { accuracy: number }>
  >
  setTimingParams: React.Dispatch<React.SetStateAction<TimingParams>>
  setKeyBuffer: React.Dispatch<React.SetStateAction<string>>
  setShowSuccessFeedback: React.Dispatch<React.SetStateAction<boolean>>
  setLastPoints: React.Dispatch<React.SetStateAction<number>>
  setAmbiguousCharacters: React.Dispatch<React.SetStateAction<Array<string>>>
  playSound: (event: AudioEvent) => void
}

export const useKeyboardInput = ({
  gameBridge,
  isInitialized,
  isPaused,
  keyboardManager,
  setActiveCharacters,
  setStats,
  setTimingParams,
  setKeyBuffer,
  setShowSuccessFeedback,
  setLastPoints,
  setAmbiguousCharacters,
  playSound,
}: UseKeyboardInputProps): void => {
  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore special keys
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return
      if (e.key === " ") return

      const now = Date.now()

      // Add to local display buffer
      keyboardManager.addKey(e.key, now)

      // Send to WASM engine - returns array of events
      const events = gameBridge.processKeyPress(e.key)

      // Process each event
      events.forEach((event) => {
        processGameEvent(event, {
          setActiveCharacters,
          setStats,
          setTimingParams,
          setKeyBuffer,
          setShowSuccessFeedback,
          setLastPoints,
          setAmbiguousCharacters,
          playSound,
          gameBridge,
          keyboardManager,
        })
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return (): void => window.removeEventListener("keydown", handleKeyDown)
  }, [
    gameBridge,
    keyboardManager,
    isPaused,
    isInitialized,
    playSound,
    setActiveCharacters,
    setStats,
    setTimingParams,
    setKeyBuffer,
    setShowSuccessFeedback,
    setLastPoints,
    setAmbiguousCharacters,
  ])
}

// ============================================================================
// EVENT PROCESSOR
// ============================================================================

type EventHandlers = {
  setActiveCharacters: React.Dispatch<
    React.SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: React.Dispatch<
    React.SetStateAction<GameStats & { accuracy: number }>
  >
  setTimingParams: React.Dispatch<React.SetStateAction<TimingParams>>
  setKeyBuffer: React.Dispatch<React.SetStateAction<string>>
  setShowSuccessFeedback: React.Dispatch<React.SetStateAction<boolean>>
  setLastPoints: React.Dispatch<React.SetStateAction<number>>
  setAmbiguousCharacters: React.Dispatch<React.SetStateAction<Array<string>>>
  playSound: (event: AudioEvent) => void
  gameBridge: WasmGameBridge
  keyboardManager: KeyboardInputManager
}

function processGameEvent(event: GameEvent, handlers: EventHandlers): void {
  const {
    setActiveCharacters,
    setStats,
    setTimingParams,
    setKeyBuffer,
    setShowSuccessFeedback,
    setLastPoints,
    setAmbiguousCharacters,
    playSound,
    gameBridge,
    keyboardManager,
  } = handlers

  try {
    switch (event.type) {
      case "matchFound": {
        setActiveCharacters((prev) => {
          const next = new Map(prev)
          next.delete(event.cellId)
          return next
        })

        setLastPoints(event.points)

        setShowSuccessFeedback(true)
        setTimeout(() => {
          setShowSuccessFeedback(false)
        }, 500)

        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        const sound = event.isHighQuality ? "match_perfect" : "match_correct"

        playSound(sound)

        break
      }

      case "statsUpdated": {
        const accuracy = calculateAccuracy(event.stats)

        setStats({
          ...event.stats,
          accuracy,
        })

        break
      }

      case "bufferUpdated": {
        setKeyBuffer(event.currentBuffer)
        setAmbiguousCharacters([])

        break
      }

      case "ambiguousInput": {
        setKeyBuffer(event.currentBuffer)
        setAmbiguousCharacters(event.potentialMatches)

        break
      }

      case "inputMissed": {
        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        playSound("match_miss")

        break
      }

      case "difficultyChanged": {
        const timing = gameBridge.getTimingParams()

        setTimingParams(timing)

        if (event.reason === "perfectMatch") {
          playSound("difficulty_increase")
        }

        break
      }

      case "streakMilestone": {
        playSound("streak_milestone")
        break
      }
      case "characterSpawned":
      case "charactersExpired":
      case "boardFull": {
        // These are handled by:
        // - spawn loop
        // - update loop
        // - board lifecycle logic
        break
      }

      default: {
        event satisfies never
        throw new Error(
          `[processGameEvent] Unhandled GameEvent: ${JSON.stringify(event)}`
        )
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[processGameEvent] Exception while processing event:",
      event,
      err
    )
  }
}

function calculateAccuracy(stats: GameStats): number {
  const total = stats.totalCorrect + stats.totalMissed
  return total === 0 ? 0 : (stats.totalCorrect / total) * 100
}
