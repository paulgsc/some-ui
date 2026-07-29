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
   * The currently in-progress multi-token challenge, if any - both read
   * (to gate spawning: a word challenge is a queue of one, never several
   * simultaneously in flight) and written (via `setWordProgress`, on each
   * new word spawn) by this hook. Always `null` for single-jamo (n=1) play,
   * which has no such concept and spawns exactly as it always has.
   */
  wordProgress?: WordProgress | null
  setWordProgress?: React.Dispatch<React.SetStateAction<WordProgress | null>>
  /** Misses observed since the tracked word spawned, for #762's hint escalation. */
  setMissCount?: React.Dispatch<React.SetStateAction<number>>
  /**
   * The tracked word challenge ran out of time with jamo still unreached.
   * Fired instead of quietly dropping the cells, so the host can reveal what
   * was missed and debrief before the next word spawns. Not fired for a word
   * the player completed (that resolves through `matchFound`), and never for
   * single-jamo (n=1) play, which has no tracked word to begin with.
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

  // ====================================================================
  // SPAWN CHARACTER
  // ====================================================================
  const spawnCharacter = useCallback(() => {
    const bridge = gameBridgeRef.current
    if (!bridge) return

    // A word challenge is a queue of one (never several simultaneously in
    // flight): wait for the tracked word to resolve - matched or expired -
    // before asking the engine to spawn the next one. Single-jamo play
    // never populates wordProgress, so this is a no-op there and every
    // existing completion/endless cell keeps spawning concurrently exactly
    // as it always has.
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

          // Track a newly spawned word challenge - both for the
          // Prompt/Concept Station's progress display (#762) and as the
          // queue-gate `spawnCharacter` checks above. A single-jamo (n=1)
          // spawn is intentionally not tracked - there is never more than
          // one jamo-shaped "challenge" worth gating on, since completion/
          // endless play was always meant to spawn concurrently.
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

          const tracked = wordProgressRef.current
          const trackedExpired =
            tracked?.cellIds.some((id) => event.cellIds.includes(id)) ?? false
          // A tracked word that ran out of time with jamo still unreached is
          // the teachable case: hand it to the host to reveal and debrief
          // rather than deleting the evidence. The host is responsible for
          // clearing these cells when it's done with them.
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

          // If the word the station is currently tracking just expired,
          // clear it - this also releases the spawn queue-gate above, so
          // the next spawn tick can start the next word. When there's a
          // debrief to run first, the host re-gates spawning by pausing the
          // loop for as long as the debrief is up.
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
