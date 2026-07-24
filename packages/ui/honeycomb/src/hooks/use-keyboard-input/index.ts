import type { Dispatch, SetStateAction } from "react"
import { useEffect } from "react"
import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import type { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameEvent,
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  WordProgress,
} from "@honeycomb/types/hangul-types"

type UseKeyboardInputProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  keyboardManager: KeyboardInputManager
  setActiveCharacters: Dispatch<
    SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: Dispatch<SetStateAction<GameStats & { accuracy: number }>>
  setTimingParams: Dispatch<SetStateAction<TimingParams>>
  setKeyBuffer: Dispatch<SetStateAction<string>>
  setShowSuccessFeedback: Dispatch<SetStateAction<boolean>>
  setLastPoints: Dispatch<SetStateAction<number>>
  setAmbiguousCharacters: Dispatch<SetStateAction<Array<string>>>
  playSound: (event: AudioEvent) => void
  /** Tracks the currently in-progress multi-token challenge, if any (#426). */
  setWordProgress?: Dispatch<SetStateAction<WordProgress | null>>
  /** The just-completed word's glyph text, for the "Celebrate" ceremony (#426). */
  setCelebrationWord?: Dispatch<SetStateAction<string | undefined>>
  /** Misses observed since the tracked word spawned, for #762's hint escalation. */
  setMissCount?: Dispatch<SetStateAction<number>>
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
  setWordProgress,
  setCelebrationWord,
  setMissCount,
}: UseKeyboardInputProps): void => {
  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey) return

      // Backspace corrects the in-progress token only (ADR 0003 §2(b)) - it's
      // a multi-char key name, so it must be special-cased before the
      // length > 1 guard below that otherwise ignores it.
      if (e.key === "Backspace") {
        keyboardManager.removeLastKey()
        const events = gameBridge.processBackspace()
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
            setWordProgress,
            setCelebrationWord,
            setMissCount,
          })
        })
        return
      }

      // Ignore other special keys
      if (e.key.length > 1) return
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
          setWordProgress,
          setCelebrationWord,
          setMissCount,
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
    setWordProgress,
    setCelebrationWord,
    setMissCount,
  ])
}

// ============================================================================
// EVENT PROCESSOR
// ============================================================================

type EventHandlers = {
  setActiveCharacters: Dispatch<
    SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: Dispatch<SetStateAction<GameStats & { accuracy: number }>>
  setTimingParams: Dispatch<SetStateAction<TimingParams>>
  setKeyBuffer: Dispatch<SetStateAction<string>>
  setShowSuccessFeedback: Dispatch<SetStateAction<boolean>>
  setLastPoints: Dispatch<SetStateAction<number>>
  setAmbiguousCharacters: Dispatch<SetStateAction<Array<string>>>
  playSound: (event: AudioEvent) => void
  gameBridge: WasmGameBridge
  keyboardManager: KeyboardInputManager
  setWordProgress?: Dispatch<SetStateAction<WordProgress | null>>
  setCelebrationWord?: Dispatch<SetStateAction<string | undefined>>
  setMissCount?: Dispatch<SetStateAction<number>>
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
    setWordProgress,
    setCelebrationWord,
    setMissCount,
  } = handlers

  try {
    switch (event.type) {
      case "matchFound": {
        setActiveCharacters((prev) => {
          const next = new Map(prev)

          // A word challenge locks in every cell it reserved (ADR 0003 §2(a)),
          // not just one; a single-jamo (n=1) match has cellIds = [cellId],
          // so this loop is exactly today's single-cell behavior there.
          event.cellIds.forEach((cellId) => {
            if (event.countsTowardCompletion) {
              // Completed: lock the character into its cell (persist) and stop
              // it counting down. The engine has already drained it from the
              // test pool and reserved the cell, so nothing will spawn on top
              // of it.
              const solved = next.get(cellId)
              if (solved) {
                next.set(cellId, {
                  ...solved,
                  isSolved: true,
                  timeRemaining: 1,
                })
              }
            } else {
              // Correct but not yet mastered: it will respawn, so clear the cell.
              next.delete(cellId)
            }
          })

          return next
        })

        setLastPoints(event.points)

        // A multi-token match is a word's "Celebrate" ceremony (ADR 0003
        // §2(c)): show the completed glyph text alongside the points popup.
        // A single-jamo match clears it back to undefined, matching today's
        // points-only popup.
        setCelebrationWord?.(
          event.cellIds.length > 1 ? event.hangul : undefined
        )
        setWordProgress?.(null)

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

      case "answerProgress": {
        // A mid-word token matched (canon Def. 4.3) but the challenge isn't
        // complete yet: advance every sibling cell's cursor so placeholder
        // cells past it reveal, without touching score/streak/mastery (those
        // are handled only on the completing match, in "matchFound").
        setActiveCharacters((prev) => {
          const next = new Map(prev)
          event.cellIds.forEach((cellId) => {
            const char = next.get(cellId)
            if (char) {
              next.set(cellId, { ...char, cursor: event.cursor })
            }
          })
          return next
        })

        setWordProgress?.({
          cellIds: event.cellIds,
          answerGlyphs: [...event.composedSoFar, ...event.remaining],
          cursor: event.cursor,
        })

        // The engine clears its key buffer on this same transition
        // (process_input's advance_or_complete), mirroring matchFound's own
        // client-side clear rather than waiting for a separate bufferUpdated.
        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        playSound("match_correct")

        break
      }

      case "inputMissed": {
        keyboardManager.clearBuffer()
        setKeyBuffer("")
        setAmbiguousCharacters([])

        // Drives #762's hint-tier escalation (miss count on the current
        // challenge); reset back to 0 on each new spawn (useGameLoop).
        setMissCount?.((count) => count + 1)

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
