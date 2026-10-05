import type { JSX } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ControlButtons } from "@honeycomb/components/hangul-hex-grid/control-buttons"
import { DecorativeParticles } from "@honeycomb/components/hangul-hex-grid/decorative-particles"
import { ErrorState } from "@honeycomb/components/hangul-hex-grid/error-state"
import { GameOverModal } from "@honeycomb/components/hangul-hex-grid/game-over-modal"
import { GridErrorOverlay } from "@honeycomb/components/hangul-hex-grid/grid-error-overlay"
import { HangulHexCell } from "@honeycomb/components/hangul-hex-grid/hangul-hex-cell"
import { InstructionsPanel } from "@honeycomb/components/hangul-hex-grid/instructions-panel"
import { KeyBufferDisplay } from "@honeycomb/components/hangul-hex-grid/key-buffer-display"
import { LoadingState } from "@honeycomb/components/hangul-hex-grid/loading-state"
import { PauseOverlay } from "@honeycomb/components/hangul-hex-grid/pause-overlay"
import { PromptStation } from "@honeycomb/components/hangul-hex-grid/prompt-station"
import { StatsPanel } from "@honeycomb/components/hangul-hex-grid/stats-panel"
import { SuccessFeedback } from "@honeycomb/components/hangul-hex-grid/success-feedback"
import { VocabDebriefModal } from "@honeycomb/components/hangul-hex-grid/vocab-debrief-modal"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { HANGUL_WORDS, toChallengeSeed } from "@honeycomb/data"
import type { WordEntry } from "@honeycomb/data"
import { useGameAudio } from "@honeycomb/hooks/use-game-audio"
import { useGameLoop } from "@honeycomb/hooks/use-game-loop"
import { useGameTimer } from "@honeycomb/hooks/use-game-timer"
import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import { useKeyboardInput } from "@honeycomb/hooks/use-keyboard-input"
import { usePromptEscalation } from "@honeycomb/hooks/use-prompt-escalation"
import type { DifficultyPreset } from "@honeycomb/lib/hangul/difficulty-presets"
import { resolveDifficultyConfig } from "@honeycomb/lib/hangul/difficulty-presets"
import { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameMode,
  GameStats,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import {
  DEFAULT_GAME_CONFIG,
  HANGUL_GRID_CELL_COUNT,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  MissedWord,
  WordProgress,
} from "@honeycomb/types/hangul-types"
import type { HexCellData } from "@honeycomb/types/hex-grid"

/** Matches `useGameAudio`'s own default, kept here as the documented one. */
const DEFAULT_EFFECTS_VOLUME = 0.5

type HangulHexGridProps = {
  /**
   * Whether this instance may play sound effects, and how loudly. The host
   * owns the person's choice; omitted, sound is on at half volume.
   */
  audio?: { enabled?: boolean; volume?: number }
  mode?: GameMode
  /**
   * A named difficulty, not raw engine config: this package alone maps each
   * label to GameConfig fields (see difficulty-presets).
   * @default "standard"
   */
  difficulty?: DifficultyPreset
  /**
   * Opaque identity of the placing session, forwarded so the WASM loader
   * singleton can tell a new session from the same one continuing (see
   * useHangulGameWasm). Omitted, the engine diffs on mode only.
   */
  sessionKey?: string
  /**
   * Something outside needs exclusive control (a host layout editor): the
   * game loop and keyboard capture idle as for the pause button.
   */
  suspended?: boolean
  /**
   * The word pool for the vocabulary modes, defaulting to `HANGUL_WORDS`.
   * A host swaps in its own seed here, in `hangul-words.ts`'s shape.

   */
  words?: Array<WordEntry>
}

export const HangulHexGrid = ({
  audio,
  mode = "completion",
  difficulty,
  sessionKey,
  suspended = false,
  words = HANGUL_WORDS,
}: HangulHexGridProps): JSX.Element => {
  // Memoized so useHangulGameWasm's [mode, config, wordPool]-keyed
  // initialize() stays stable.
  const config = useMemo(
    () => resolveDifficultyConfig(difficulty),
    [difficulty]
  )
  const wordPool = useMemo(() => words.map(toChallengeSeed), [words])
  // The engine reports only whether romanization is shown now, not the
  // streak threshold StatsPanel displays ("standard" uses the default).
  const hideRomanizationStreak =
    config.hideRomanizationStreak ?? DEFAULT_GAME_CONFIG.hideRomanizationStreak
  const [keyboardManager] = useState(() => new KeyboardInputManager())
  const [activeCharacters, setActiveCharacters] = useState<
    Map<string, CharacterWithLifetime>
  >(new Map())
  const [stats, setStats] = useState<GameStats & { accuracy: number }>({
    score: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalMissed: 0,
    accuracy: 0,
  })
  const [timingParams, setTimingParams] = useState<TimingParams>({
    spawnIntervalMs: 1500,
    characterLifetimeMs: 3000,
    showRomanization: true,
  })
  const [isPaused, setIsPaused] = useState(false)
  const [ambiguousCharacters, setAmbiguousCharacters] = useState<Array<string>>(
    []
  )
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false)
  const [lastPoints, setLastPoints] = useState(0)
  const [keyBuffer, setKeyBuffer] = useState("")
  const [wordProgress, setWordProgress] = useState<WordProgress | null>(null)
  const [celebrationWord, setCelebrationWord] = useState<string | undefined>(
    undefined
  )
  const [missCount, setMissCount] = useState(0)
  // A vocabulary word that ran out of time unfinished. While this is set, the
  // run is held: the board keeps the expired cells (revealed and marked
  // missed) and the debrief panel explains what was missed, and only once it
  // is dismissed do those cells go away and the next word spawn.
  const [missedWord, setMissedWord] = useState<MissedWord | null>(null)
  // The grid's own hex-geometry WASM (via HexGrid) is separate from the game
  // engine's; HexGrid's onStatusChange lets a fatal grid failure stop the
  // loop, audio and timer instead of running blind.
  const [gridError, setGridError] = useState<string | null>(null)
  const isGridFatal = gridError !== null
  const handleGridStatusChange = useCallback(
    (status: { isLoading: boolean; error: string | null }) => {
      setGridError(status.error)
    },
    []
  )

  const { isLoading, error, gameBridge, isInitialized } = useHangulGameWasm({
    autoStart: true,
    mode,
    config,
    wordPool,
    sessionKey,
  })

  // The host decides whether and how loudly sound effects play.
  const { unlockAudio, playSound } = useGameAudio({
    enabled: audio?.enabled ?? true,
    volume: audio?.volume ?? DEFAULT_EFFECTS_VOLUME,
  })

  useEffect((): (() => void) => {
    const handler = (_e: KeyboardEvent): void => {
      unlockAudio()
      window.removeEventListener("keydown", handler)
    }

    window.addEventListener("keydown", handler, { once: true })
    return () => window.removeEventListener("keydown", handler)
  }, [unlockAudio])

  const { gameStatus, isGameOver, timeRemainingMs, progress } = useGameTimer({
    gameBridge,
    isInitialized,
    onComplete: (status) => {
      playSound("game_complete")
      setIsPaused(true)
      // eslint-disable-next-line no-console
      console.log("🎉 Game completed!", status)
    },
    onTimeout: (status) => {
      playSound("game_timeout")
      setIsPaused(true)
      // eslint-disable-next-line no-console
      console.log("⏰ Time ran out!", status)
    },
  })

  // Everything that stops the run: pause, a terminal status, a fatal grid
  // failure, a host taking control, or a missed-word debrief (which renders
  // off cells the next spawn would overwrite). isGameOver is here directly so
  // the loop stops on the tick the engine says so, not after
  // setIsPaused(true) round-trips through a render.
  const isHalted =
    isPaused || isGameOver || isGridFatal || suspended || missedWord !== null

  useGameLoop({
    gameBridge,
    isInitialized,
    isPaused: isHalted,
    setActiveCharacters,
    setStats,
    setTimingParams,
    playSound,
    onBoardFull: () => {
      playSound("board_full")
    },
    wordProgress,
    setWordProgress,
    setMissCount,
    onWordMissed: setMissedWord,
  })

  useKeyboardInput({
    gameBridge,
    isInitialized,
    isPaused: isHalted,
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
  })

  // The tracked word's stimulus/spawn time, derived from the same
  // activeCharacters entries the hex cells read.
  const trackedCellId = wordProgress?.cellIds[0]
  const trackedCharacter = trackedCellId
    ? activeCharacters.get(trackedCellId)
    : undefined
  const promptTier = usePromptEscalation({
    active: trackedCharacter !== undefined,
    spawnedAt: trackedCharacter?.spawnedAt,
    missCount,
  })

  // Likewise for the debriefed word, whose cells stay on the board.
  const missedCellId = missedWord?.cellIds[0]
  const missedStimulus = missedCellId
    ? activeCharacters.get(missedCellId)?.stimulus
    : undefined
  const missedEntry =
    missedStimulus?.kind === "icon"
      ? words.find((word) => word.id === missedStimulus.name)
      : undefined

  const handleDebriefDismiss = useCallback(() => {
    if (!missedWord) return
    // The debrief was the only reason these cells outlived their expiry.
    setActiveCharacters((prev) => {
      const next = new Map(prev)
      missedWord.cellIds.forEach((cellId) => next.delete(cellId))
      return next
    })
    setMissedWord(null)
  }, [missedWord])

  const handleReset = useCallback(() => {
    if (!gameBridge) return

    gameBridge.reset()
    keyboardManager.reset()
    setActiveCharacters(new Map())
    setStats(gameBridge.getStats())
    setTimingParams(gameBridge.getTimingParams())
    setKeyBuffer("")
    setWordProgress(null)
    setCelebrationWord(undefined)
    setMissCount(0)
    setMissedWord(null)
    setIsPaused(false)

    if (mode === "completion") {
      gameBridge.startTimer()
    }
  }, [gameBridge, keyboardManager, mode])

  const handleTogglePause = useCallback(() => {
    if (!isGameOver) {
      setIsPaused((prev) => !prev)
    }
  }, [isGameOver])

  const handleContinue = useCallback(() => {
    handleReset()
  }, [handleReset])

  if (isLoading) {
    return <LoadingState />
  }

  if (error || !gameBridge) {
    return <ErrorState error={error} />
  }

  const cellContent: Array<{
    id: string
    content: HexCellData<CharacterWithLifetime>
  }> = Array.from(activeCharacters.values()).map((char) => ({
    id: char.cellId,
    content: {
      data: char,
      theme: {
        fill: char.color,
        stroke: char.color,
        strokeWidth: 2,
        opacity: 0.75,
      },
    },
  }))

  return (
    <div className="absolute inset-0">
      <div className="relative size-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div
          className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10 animate-pulse"
          style={{ animationDuration: "8s" }}
        />

        <SuccessFeedback
          show={showSuccessFeedback}
          points={lastPoints}
          word={celebrationWord}
        />

        <main className="size-full absolute">
          <div className="size-full relative">
            <HexGrid
              cellCount={HANGUL_GRID_CELL_COUNT}
              hexSize={70}
              viewBoxFactor={1.2}
              cellContent={cellContent}
              backgroundOpacity={0.8}
              // "shrink-only" is required: engine cell ids come from
              // HANGUL_GRID_RADIUS (see wasm-game-bridge), and a smaller radius
              // would render different ids than the game spawns into.
              fitStrategy="shrink-only"
              onStatusChange={handleGridStatusChange}
              className="[&_g:first-of-type_path]:stroke-white/30 [&_g:first-of-type_path]:stroke-[2]"
              renderCell={(cell, centerX, centerY, cellWidth, hexPath) => {
                const { id, content } = cell
                if (!content) return null
                const {
                  data: {
                    color,
                    hangul,
                    qwertyKey,
                    romanization,
                    spawnedAt,
                    timeRemaining,
                    isSolved,
                    tokenIndex,
                    cursor,
                    answerGlyphs,
                    isMissed,
                  },
                  theme: { opacity },
                } = content
                // Only a multi-cell word (ADR 0003 §2(a)) masks cells until
                // the cursor reaches them. A single-jamo cell has no cursor
                // (answerProgress never fires for n=1; 0/0 would read as
                // "not yet reached"), so it is visible from spawn.

                const isPlaceholder =
                  !isSolved && answerGlyphs.length > 1 && tokenIndex >= cursor
                return (
                  <HangulHexCell
                    character={{
                      id,
                      hangul: hangul,
                      qwertyKey: qwertyKey,
                      romanization: romanization,
                      color: color,
                      spawnedAt: spawnedAt,
                      releaseYear: 0,
                      playedAt: spawnedAt,
                    }}
                    centerX={centerX}
                    centerY={centerY}
                    cellWidth={cellWidth}
                    opacity={isSolved ? 1 : opacity}
                    hexPath={hexPath}
                    timeRemaining={timeRemaining}
                    showRomanization={timingParams.showRomanization}
                    isSolved={isSolved}
                    isPlaceholder={isPlaceholder}
                    isMissed={isMissed}
                  />
                )
              }}
            />
          </div>
        </main>

        <StatsPanel
          stats={stats}
          timingParams={timingParams}
          currentTimeWindow={gameBridge.getCurrentTimeWindow()}
          mode={mode}
          timeRemaining={timeRemainingMs}
          progress={progress}
          hideRomanizationStreak={hideRomanizationStreak}
        />

        <KeyBufferDisplay
          buffer={keyBuffer}
          ambiguousCharacters={ambiguousCharacters}
        />

        <PromptStation
          stimulus={trackedCharacter?.stimulus ?? null}
          tier={promptTier}
          progress={wordProgress}
          words={words}
        />

        <ControlButtons
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          onReset={handleReset}
        />

        <InstructionsPanel mode={mode} />

        <PauseOverlay
          isPaused={isPaused && !isGameOver && !isGridFatal}
          onResume={handleTogglePause}
        />

        <GridErrorOverlay error={gridError} />

        {/* Suppressed once the game itself is over - the run isn't going to
            resume into a next word, so a "next word in 5s" panel would be
            lying, and GameOverModal is the screen that matters then. */}
        <VocabDebriefModal
          missed={isGameOver || isGridFatal ? null : missedWord}
          entry={missedEntry}
          onDismiss={handleDebriefDismiss}
        />

        <GameOverModal
          isOpen={isGameOver}
          status={gameStatus}
          stats={stats}
          onContinue={handleContinue}
        />

        <DecorativeParticles />
      </div>
    </div>
  )
}
