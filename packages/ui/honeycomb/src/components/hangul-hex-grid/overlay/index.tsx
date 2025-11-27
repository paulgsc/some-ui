import { useCallback, useState } from "react"
import { ControlButtons } from "@honeycomb/components/hangul-hex-grid/control-buttons"
import { DecorativeParticles } from "@honeycomb/components/hangul-hex-grid/decorative-particles"
import { ErrorState } from "@honeycomb/components/hangul-hex-grid/error-state"
import { GameOverModal } from "@honeycomb/components/hangul-hex-grid/game-over-modal"
import { HangulHexCell } from "@honeycomb/components/hangul-hex-grid/hangul-hex-cell"
import { InstructionsPanel } from "@honeycomb/components/hangul-hex-grid/instructions-panel"
import { KeyBufferDisplay } from "@honeycomb/components/hangul-hex-grid/key-buffer-display"
import { LoadingState } from "@honeycomb/components/hangul-hex-grid/loading-state"
import { PauseOverlay } from "@honeycomb/components/hangul-hex-grid/pause-overlay"
import { StatsPanel } from "@honeycomb/components/hangul-hex-grid/stats-panel"
import { SuccessFeedback } from "@honeycomb/components/hangul-hex-grid/success-feedback"
import type { HexCellData } from "@honeycomb/components/hex-grid"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { useGameAudio } from "@honeycomb/hooks/use-game-audio"
import { useGameLoop } from "@honeycomb/hooks/use-game-loop"
import { useGameTimer } from "@honeycomb/hooks/use-game-timer"
import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import { useKeyboardInput } from "@honeycomb/hooks/use-keyboard-input"
import { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameMode,
  GameStats,
  GameStatus,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { CharacterWithLifetime } from "@honeycomb/types/hangul-types"

type HangulHexGridProps = {
  mode?: GameMode
  gameDurationSeconds?: number
}

export const HangulHexGrid = ({
  mode = "completion",
  gameDurationSeconds = 3 * 60,
}: HangulHexGridProps): React.JSX.Element => {
  const { isLoading, error, gameBridge, isInitialized } = useHangulGameWasm({
    autoStart: true,
    mode,
    gameDurationSeconds,
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
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false)
  const [lastPoints, setLastPoints] = useState(0)
  const [keyBuffer, setKeyBuffer] = useState("")

  // Game timer hook (for timed modes)
  const { isGameOver, timeRemainingMs, progress } = useGameTimer({
    gameBridge,
    isInitialized,
    isPaused,
    onComplete: (status) => {
      playSound("game_complete")
      setIsPaused(true)
      console.log("🎉 Game completed!", status)
    },
    onTimeout: (status) => {
      playSound("game_timeout")
      setIsPaused(true)
      console.log("⏰ Time ran out!", status)
    },
  })

  // Initialize audio
  const { playSound } = useGameAudio({ enabled: true, volume: 0.5 })

  // Game loop hook
  useGameLoop({
    gameBridge,
    isInitialized,
    isPaused,
    timingParams,
    setActiveCharacters,
    setStats,
    setTimingParams,
    playSound,
  })

  // Keyboard input hook
  useKeyboardInput({
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
    playSound,
  })

  const handleReset = useCallback(() => {
    if (!gameBridge) return

    gameBridge.reset()
    keyboardManager.reset()
    setActiveCharacters(new Map())
    setStats(gameBridge.getStats())
    setTimingParams(gameBridge.getTimingParams())
    setKeyBuffer("")
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

  const hexCells: Array<HexCellData<CharacterWithLifetime>> = Array.from(
    activeCharacters.values()
  ).map((char) => ({
    id: char.cellId,
    data: char,
    theme: {
      fill: char.color,
      stroke: char.color,
      strokeWidth: 2,
      opacity: 0.75,
    },
  }))

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div
        className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10 animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      <SuccessFeedback show={showSuccessFeedback} points={lastPoints} />

      <HexGrid
        cellCount={67}
        hexSize={70}
        viewBoxFactor={1.2}
        cells={hexCells}
        backgroundOpacity={0.8}
        className="[&_g:first-of-type_path]:stroke-white/30 [&_g:first-of-type_path]:stroke-[2]"
        renderCell={(cell, centerX, centerY, cellWidth, hexPath) => (
          <HangulHexCell
            character={{
              id: cell.data.cellId,
              hangul: cell.data.hangul,
              qwertyKey: cell.data.qwertyKey,
              romanization: cell.data.romanization,
              color: cell.data.color,
              spawnedAt: cell.data.spawnedAt,
              releaseYear: 0,
              playedAt: cell.data.spawnedAt,
            }}
            centerX={centerX}
            centerY={centerY}
            cellWidth={cellWidth}
            opacity={cell.theme?.opacity}
            hexPath={hexPath}
            timeRemaining={cell.data.timeRemaining}
            showRomanization={timingParams.showRomanization}
          />
        )}
      />

      <StatsPanel
        stats={stats}
        timingParams={timingParams}
        currentTimeWindow={gameBridge.getCurrentTimeWindow()}
        mode={mode}
        timeRemaining={timeRemainingMs}
        progress={progress}
      />

      <KeyBufferDisplay buffer={keyBuffer} />

      <ControlButtons
        isPaused={isPaused}
        isGameOver={isGameOver}
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
        status={"game-over"}
        stats={stats}
        onContinue={handleContinue}
      />

      <DecorativeParticles />
    </div>
  )
}
