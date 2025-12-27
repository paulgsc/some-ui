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
}: UseKeyboardInputProps) => {
  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore special keys
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return
      if (e.key === " ") return

      const now = Date.now()

      // Add to local display buffer
      keyboardManager.addKey(e.key, now)

      // Send to WASM engine - returns array of events
      const events = gameBridge.processKeyPress(e.key)
      console.log("events: ", events)

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
    return () => window.removeEventListener("keydown", handleKeyDown)
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
  console.groupCollapsed(`[processGameEvent] ${event.type}`, event)

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
        console.log("[matchFound] Removing character:", event.cellId)

        setActiveCharacters((prev) => {
          const next = new Map(prev)
          next.delete(event.cellId)
          console.log("[matchFound] Active characters after delete:", next.size)
          return next
        })

        console.log("[matchFound] Points awarded:", event.points)
        setLastPoints(event.points)

        console.log("[matchFound] Showing success feedback")
        setShowSuccessFeedback(true)
        setTimeout(() => {
          console.log("[matchFound] Hiding success feedback")
          setShowSuccessFeedback(false)
        }, 500)

        console.log("[matchFound] Clearing keyboard buffer")
        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        const sound = event.isHighQuality ? "match_perfect" : "match_correct"

        console.log("[matchFound] Playing sound:", sound)
        playSound(sound)

        break
      }

      case "statsUpdated": {
        console.log("[statsUpdated] New stats:", event.stats)

        const accuracy = calculateAccuracy(event.stats)
        console.log("[statsUpdated] Calculated accuracy:", accuracy)

        setStats({
          ...event.stats,
          accuracy,
        })

        break
      }

      case "bufferUpdated": {
        console.log("[bufferUpdated] Current buffer:", event.currentBuffer)

        setKeyBuffer(event.currentBuffer)
        setAmbiguousCharacters([])

        break
      }

      case "ambiguousInput": {
        console.log("[ambiguousInput] Buffer:", event.currentBuffer)
        console.log(
          "[ambiguousInput] Potential matches:",
          event.potentialMatches
        )

        setKeyBuffer(event.currentBuffer)
        setAmbiguousCharacters(event.potentialMatches)

        break
      }

      case "inputMissed": {
        console.warn("[inputMissed] Input missed — clearing buffer")

        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        console.log("[inputMissed] Playing miss sound")
        playSound("match_miss")

        break
      }

      case "difficultyChanged": {
        console.log("[difficultyChanged] Reason:", event.reason)

        const timing = gameBridge.getTimingParams()
        console.log("[difficultyChanged] New timing params:", timing)

        setTimingParams(timing)

        if (event.reason === "PerfectMatch") {
          console.log("[difficultyChanged] Playing difficulty increase sound")
          playSound("difficulty_increase")
        }

        break
      }

      case "streakMilestone": {
        console.log("[streakMilestone] Streak:", event.streak)

        playSound("streak_milestone")
        break
      }

      default: {
        console.error("[processGameEvent] Unhandled event type!", event)
        event satisfies never
      }
    }
  } catch (err) {
    console.error(
      "[processGameEvent] Exception while processing event:",
      event,
      err
    )
  } finally {
    console.groupEnd()
  }
}

function calculateAccuracy(stats: GameStats): number {
  const total = stats.totalCorrect + stats.totalMissed
  return total === 0 ? 0 : (stats.totalCorrect / total) * 100
}
