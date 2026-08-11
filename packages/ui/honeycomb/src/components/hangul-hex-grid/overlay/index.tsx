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
   * Whether this instance may play its sound effects, and how loudly.
   *
   * A host with an audio preference passes it here; one without gets
   * today's behaviour (on, at half volume). The component never reads a
   * global - the host owns the person's choice, this owns the sounds.
   */
  audio?: { enabled?: boolean; volume?: number }
  mode?: GameMode
  /**
   * A named difficulty, not raw engine config (ADR-aligned with #762's
   * "host-layer realizations of engine primitives" idiom): a host app picks
   * one of three lay-facing labels, and this package alone knows what each
   * means in terms of GameConfig fields (see difficulty-presets).
   * @default "standard"
   */
  difficulty?: DifficultyPreset
  /**
   * Opaque identity of whatever session/instance is currently placing this
   * component - this package doesn't interpret it, only forwards it so the
   * WASM loader singleton can tell "a new session started" apart from "the
   * same session continues," independent of whether `mode` also changed
   * (see useHangulGameWasm). Omit if the host has no such concept (e.g.
   * Storybook) - the engine falls back to mode-only diffing.
   */
  sessionKey?: string
  /**
   * True when something outside this component currently needs exclusive
   * control (e.g. a host-level layout editor is open) - the game loop and
   * keyboard capture idle while this is true, the same way they already do
   * for the manual pause button, rather than silently continuing to spawn/
   * tick/consume keystrokes underneath whatever else is now in control.
   * Omit if the host has no such concept.
   */
  suspended?: boolean
  /**
   * The word pool for "vocabulary"/"vocabulary-endless" modes (ignored by
   * every other mode) - defaults to the bundled demo seed
   * (`@honeycomb/data`'s `HANGUL_WORDS`), same as before this prop existed.
   * This is the seam a host app uses to swap in its own challenge seed
   * (e.g. an LLM-generated, environment-specific vocab set fetched at
   * runtime) without this package knowing or caring where the words came
   * from - it only ever sees a plain `Array<WordEntry>`, matching
   * `hangul-words.ts`'s own shape/constraints (open-syllable only, see that
   * file's header comment).
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
  // Memoized so useHangulGameWasm's own [mode, config, wordPool]-keyed
  // initialize() callback stays referentially stable across re-renders that
  // don't change the difficulty prop.
  const config = useMemo(
    () => resolveDifficultyConfig(difficulty),
    [difficulty]
  )
  const wordPool = useMemo(() => words.map(toChallengeSeed), [words])
  // The engine only reports whether romanization is *currently* shown
  // (TimingParams.showRomanization), not the streak threshold that governs
  // it - StatsPanel needs the actual configured number to display, which
  // for "standard" is the engine's own default (no override present).
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
  // The honeycomb grid's own hex-geometry WASM module (@some-ui/some-hexagon,
  // via HexGrid/useHexgridWasm) is an entirely separate concern from the
  // game engine's WASM module above - a fatal failure there previously had
  // no way to reach this component at all: the grid would show its own
  // inline error while the game loop, audio, and timer kept running blind
  // (spawning, ticking, playing sounds) with nothing rendered to show it on.
  // HexGrid's onStatusChange callback closes that gap.
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

  // Initialize audio. The host decides whether sound effects play at all
  // and how loudly - this package has no idea what a person has chosen, and
  // hardcoding `enabled: true` here made every audio preference in every
  // host a toggle that controlled nothing.
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

  // Game timer hook (for timed modes)
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

  // Everything that stops the run: the manual pause button, a terminal game
  // status, a fatal grid failure, a host taking exclusive control - and now a
  // missed-word debrief, which holds the session in place until the player
  // has seen what they missed. Spawning is what actually needs holding: the
  // debrief renders off cells that would otherwise be overwritten by the next
  // word.
  //
  // isGameOver is in here (rather than left to the manual pause state)
  // because without it the spawn/update interval only stops once the
  // onComplete/onTimeout callback's setIsPaused(true) round-trips through a
  // render, one or more ticks after the engine-derived status already says
  // the game is over.
  const isHalted =
    isPaused || isGameOver || isGridFatal || suspended || missedWord !== null

  // Game loop hook
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

  // Keyboard input hook
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

  // #762 Prompt/Concept Station: derive the tracked word's stimulus/spawn
  // time from the same activeCharacters entries the hex cells already read,
  // rather than duplicating that state.
  const trackedCellId = wordProgress?.cellIds[0]
  const trackedCharacter = trackedCellId
    ? activeCharacters.get(trackedCellId)
    : undefined
  const promptTier = usePromptEscalation({
    active: trackedCharacter !== undefined,
    spawnedAt: trackedCharacter?.spawnedAt,
    missCount,
  })

  // Same trick as `trackedCharacter` above, for the word being debriefed: its
  // cells are deliberately still on the board (revealed and flagged missed),
  // so the seed entry behind them is a lookup away rather than another copy
  // of state to keep in sync.
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

    // Restart timer for timed modes
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
      <div className="relative size-full overflow-hidden bg-gradient-to-br from-background via-purple-900 to-background">
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
              // "shrink-only" (the default) is required here, not optional: the
              // game engine's cell ids are enumerated from HANGUL_GRID_RADIUS
              // (see wasm-game-bridge), so a smaller negotiated radius would
              // make HexGrid render a different set of cell ids than the ones
              // the game is spawning characters into.
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
                // Only a genuine multi-cell word challenge (ADR 0003 §2(a))
                // masks its cells until the token-cursor reaches them. A
                // single-jamo (n=1) challenge's gameplay predates this epic
                // and must stay exactly as it was: the glyph is visible from
                // the instant it spawns, full stop - it is never "reached"
                // by a cursor, because single-jamo play has no cursor
                // concept at all (answerProgress never fires for n=1, so
                // tokenIndex/cursor would otherwise both sit at their 0/0
                // spawn defaults for the cell's entire lifetime, which is
                // indistinguishable from "not yet reached" without this gate).
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
