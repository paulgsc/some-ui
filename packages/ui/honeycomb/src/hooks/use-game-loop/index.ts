import { useCallback, useEffect, useRef } from "react"
import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import type {
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  MissedWord,
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
  /**
   * The in-progress multi-token challenge, read to gate spawning (a word
   * challenge is a queue of one) and written on each word spawn. Always
   * `null` for single-jamo play.
   */
  wordProgress?: WordProgress | null
  setWordProgress?: React.Dispatch<React.SetStateAction<WordProgress | null>>
  /** Misses observed since the tracked word spawned, for hint escalation. */
  setMissCount?: React.Dispatch<React.SetStateAction<number>>
  /**
   * The tracked word ran out of time with jamo unreached. The cells are kept
   * so the host can debrief before the next spawn. Never fired for a
   * completed word (`matchFound`) or single-jamo play.
   */
  onWordMissed?: (missed: MissedWord) => void
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
  wordProgress,
  setWordProgress,
  setMissCount,
  onWordMissed,
}: UseGameLoopProps): void => {
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gameBridgeRef = useRef(gameBridge)
  const isPausedRef = useRef(isPaused)
  const setActiveCharactersRef = useRef(setActiveCharacters)
  const setStatsRef = useRef(setStats)
  const setTimingParamsRef = useRef(setTimingParams)
  const playSoundRef = useRef(playSound)
  const onBoardFullRef = useRef(onBoardFull)
  const setWordProgressRef = useRef(setWordProgress)
  const setMissCountRef = useRef(setMissCount)
  const wordProgressRef = useRef(wordProgress)
  const onWordMissedRef = useRef(onWordMissed)

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
  useEffect(() => {
    wordProgressRef.current = wordProgress
  }, [wordProgress])
  useEffect(() => {
    onWordMissedRef.current = onWordMissed
  }, [onWordMissed])

  const spawnCharacter = useCallback(() => {
    const bridge = gameBridgeRef.current
    if (!bridge) return

    // A word challenge is a queue of one: wait for the tracked word to
    // resolve. Single-jamo play never sets wordProgress and spawns
    // concurrently.
    if (wordProgressRef.current) return

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

          // Track a new word challenge, for the Prompt Station and the
          // queue-gate above. Single-jamo spawns are not tracked.
          if (event.spawnResult.answerGlyphs.length > 1) {
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
          // Handled by input, updateCharacters and scoring; the spawn loop
          // stays side-effect minimal.
          break
        }

        default: {
          t satisfies never
          assertNever(t)
        }
      }
    })
  }, [])

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

          const tracked = wordProgressRef.current
          const trackedExpired =
            tracked?.cellIds.some((id) => event.cellIds.includes(id)) ?? false
          // A tracked word that expired unfinished goes to the host to
          // debrief; the host clears these cells when done.
          const missedWord: MissedWord | null =
            tracked &&
            trackedExpired &&
            tracked.cursor < tracked.answerGlyphs.length
              ? {
                  cellIds: tracked.cellIds,
                  answerGlyphs: tracked.answerGlyphs,
                  cursor: tracked.cursor,
                }
              : null

          setActiveCharactersRef.current((prev) => {
            const next = new Map(prev)
            event.cellIds.forEach((id) => {
              if (missedWord?.cellIds.includes(id)) {
                const char = next.get(id)
                // Frozen in place, flagged missed: the debrief renders off
                // these same cells, so they have to outlive the expiry.
                if (char)
                  next.set(id, { ...char, isMissed: true, timeRemaining: 0 })
                return
              }
              next.delete(id)
            })
            return next
          })

          // Clearing the tracked word releases the spawn queue-gate; a
          // debrief re-gates by pausing the loop while it is up.
          if (trackedExpired) {
            setWordProgressRef.current?.(null)
          }
          if (missedWord) {
            onWordMissedRef.current?.(missedWord)
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
          // Handled by the spawn loop, input handler and scoring/UI layers.
          break
        }
        default: {
          t satisfies never
          assertNever(t)
        }
      }
    })

    // Solved characters no longer count down. The budget is per token
    // (revealed_at_ms + answerKeys.length * currentWindow; canon Thm. 7.2,
    // ADR 0003 §2(a)).

    setActiveCharactersRef.current((prev) => {
      const next = new Map(prev)
      next.forEach((char, cellId) => {
        // Solved cells are locked in; missed ones are frozen at 0 for the
        // debrief. Neither has a countdown left to run.
        if (char.isSolved || char.isMissed) return
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

function calculateAccuracy(stats: GameStats): number {
  const total = stats.totalCorrect + stats.totalMissed
  return total === 0 ? 0 : (stats.totalCorrect / total) * 100
}
