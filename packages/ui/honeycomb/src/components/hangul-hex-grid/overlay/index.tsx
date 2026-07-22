import type { JSX } from "react"
import { useCallback, useEffect, useState } from "react"
import { ControlButtons } from "@honeycomb/components/hangul-hex-grid/control-buttons"
import { DecorativeParticles } from "@honeycomb/components/hangul-hex-grid/decorative-particles"
import { ErrorState } from "@honeycomb/components/hangul-hex-grid/error-state"
import { GameOverModal } from "@honeycomb/components/hangul-hex-grid/game-over-modal"
import { HangulHexCell } from "@honeycomb/components/hangul-hex-grid/hangul-hex-cell"
import { InstructionsPanel } from "@honeycomb/components/hangul-hex-grid/instructions-panel"
import { KeyBufferDisplay } from "@honeycomb/components/hangul-hex-grid/key-buffer-display"
import { LoadingState } from "@honeycomb/components/hangul-hex-grid/loading-state"
import { PauseOverlay } from "@honeycomb/components/hangul-hex-grid/pause-overlay"
import { PromptStation } from "@honeycomb/components/hangul-hex-grid/prompt-station"
import { StatsPanel } from "@honeycomb/components/hangul-hex-grid/stats-panel"
import { SuccessFeedback } from "@honeycomb/components/hangul-hex-grid/success-feedback"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { useGameAudio } from "@honeycomb/hooks/use-game-audio"
import { useGameLoop } from "@honeycomb/hooks/use-game-loop"
import { useGameTimer } from "@honeycomb/hooks/use-game-timer"
import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import { useKeyboardInput } from "@honeycomb/hooks/use-keyboard-input"
import { usePromptEscalation } from "@honeycomb/hooks/use-prompt-escalation"
import { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameMode,
  GameStats,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import { HANGUL_GRID_CELL_COUNT } from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  WordProgress,
} from "@honeycomb/types/hangul-types"
import type { HexCellData } from "@honeycomb/types/hex-grid"

type HangulHexGridProps = {
  mode?: GameMode
}

export const HangulHexGrid = ({
  mode = "completion",
}: HangulHexGridProps): JSX.Element => {
  const { isLoading, error, gameBridge, isInitialized } = useHangulGameWasm({
    autoStart: true,
    mode,
  })

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

  // Initialize audio
  const { unlockAudio, playSound } = useGameAudio({
    enabled: true,
    volume: 0.5,
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

  // Game loop hook
  useGameLoop({
    gameBridge,
    isInitialized,
    isPaused,
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
  })

  // Keyboard input hook
  useKeyboardInput({
    gameBridge,
    isInitialized,
    isPaused: isPaused || isGameOver,
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
              // "shrink-only" (the default) is required here, not optional: the
              // game engine's cell ids are enumerated from HANGUL_GRID_RADIUS
              // (see wasm-game-bridge), so a smaller negotiated radius would
              // make HexGrid render a different set of cell ids than the ones
              // the game is spawning characters into.
              fitStrategy="shrink-only"
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
        />

        <KeyBufferDisplay
          buffer={keyBuffer}
          ambiguousCharacters={ambiguousCharacters}
        />

        <PromptStation
          stimulus={trackedCharacter?.stimulus ?? null}
          tier={promptTier}
          progress={wordProgress}
        />

        <ControlButtons
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          onReset={handleReset}
        />

        <InstructionsPanel mode={mode} />

        <PauseOverlay
          isPaused={isPaused && !isGameOver}
          onResume={handleTogglePause}
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
