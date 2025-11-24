import { useCallback, useEffect, useRef, useState } from "react"
import { HangulHexCell } from "@honeycomb/components/hangul-hex-grid/hangul-hex-cell"
import { HexGrid, type HexCellData } from "@honeycomb/components/hex-grid"
import { HangulGameManager } from "@honeycomb/lib/hangul/game-manager"
import type { GameStats, HangulCharacter } from "@honeycomb/types/hangul-types"
import { DEFAULT_GAME_SETTINGS } from "@honeycomb/types/hangul-types"

export const HangulHexGrid = (): React.JSX.Element => {
  const [gameManager] = useState(
    () => new HangulGameManager(DEFAULT_GAME_SETTINGS)
  )
  const [activeCells, setActiveCells] = useState<
    Array<HexCellData<HangulCharacter>>
  >([])
  const [stats, setStats] = useState<GameStats>(gameManager.getStats())
  const [isPaused, setIsPaused] = useState(false)
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false)
  const [lastPoints, setLastPoints] = useState(0)
  const [feedbackPosition, setFeedbackPosition] = useState({ x: 0, y: 0 })

  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Update active cells display
  const updateCells = useCallback(() => {
    const expired = gameManager.update()

    if (expired.length > 0) {
      setStats(gameManager.getStats())
    }

    const cells = gameManager.getActiveCells()
    const now = Date.now()

    setActiveCells(
      cells.map((cell) => {
        const age = now - cell.character.spawnedAt
        const timeRemaining = Math.max(0, 1 - age / cell.character.timeLimit)

        return {
          id: cell.cellId,
          data: { ...cell.character, timeRemaining },
          theme: {
            fill: cell.character.color,
            stroke: cell.character.color,
            strokeWidth: 2,
            opacity: cell.opacity,
          },
        }
      })
    )
  }, [gameManager])

  // Spawn new characters periodically
  useEffect(() => {
    if (isPaused) return

    spawnTimerRef.current = setInterval(() => {
      gameManager.spawnCharacter()
      updateCells()
    }, DEFAULT_GAME_SETTINGS.spawnInterval)

    return (): void => {
      if (spawnTimerRef.current) {
        clearInterval(spawnTimerRef.current)
      }
    }
  }, [gameManager, updateCells, isPaused])

  // Update cells periodically
  useEffect(() => {
    if (isPaused) return

    updateTimerRef.current = setInterval(() => {
      updateCells()
    }, 100)

    return (): void => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current)
      }
    }
  }, [updateCells, isPaused])

  // Handle keyboard input
  useEffect(() => {
    if (isPaused) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore modifier keys and special keys
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return

      const result = gameManager.handleKeyPress(e.key)

      if (result.hit) {
        // Show success feedback at mouse position or center
        setLastPoints(result.points)
        setFeedbackPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
        setShowSuccessFeedback(true)
        setTimeout(() => setShowSuccessFeedback(false), 500)
      }

      setStats(gameManager.getStats())
      updateCells()
    }

    window.addEventListener("keydown", handleKeyDown)
    return (): void => window.removeEventListener("keydown", handleKeyDown)
  }, [gameManager, updateCells, isPaused])

  // Reset game
  const handleReset = (): void => {
    gameManager.reset()
    setStats(gameManager.getStats())
    setActiveCells([])
    setIsPaused(false)
  }

  // Toggle pause
  const handleTogglePause = (): void => {
    setIsPaused((prev) => !prev)
  }

  const accuracy = gameManager.getAccuracy()

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Animated background particles */}
      <div
        className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10 animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      {/* Success feedback */}
      {showSuccessFeedback && (
        <div
          className="absolute text-4xl font-bold text-green-400 pointer-events-none z-50 animate-ping"
          style={{
            left: feedbackPosition.x,
            top: feedbackPosition.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          +{lastPoints}
        </div>
      )}

      {/* Hex Grid */}
      <HexGrid
        cellCount={67}
        hexSize={70}
        viewBoxFactor={1.2}
        cells={activeCells}
        backgroundOpacity={0.08}
        renderCell={(cell, centerX, centerY, cellWidth, hexPath) => {
          const timeRemaining =
            (cell.data as HangulCharacter & { timeRemaining?: number })
              .timeRemaining ?? 1
          return (
            <HangulHexCell
              character={cell.data}
              centerX={centerX}
              centerY={centerY}
              cellWidth={cellWidth}
              opacity={cell.theme?.opacity}
              hexPath={hexPath}
              timeRemaining={timeRemaining}
            />
          )
        }}
      />

      {/* Stats Panel */}
      <div className="absolute top-6 left-6 glass-effect rounded-2xl px-6 py-4 text-white shadow-2xl min-w-[280px]">
        <div className="text-2xl font-bold mb-3 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          한글 타이핑
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/70">Score:</span>
            <span className="font-bold text-xl text-cyan-400">
              {stats.score}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-white/70">Accuracy:</span>
            <span
              className={`font-bold ${accuracy >= 80 ? "text-green-400" : accuracy >= 60 ? "text-yellow-400" : "text-red-400"}`}
            >
              {accuracy.toFixed(1)}%
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-white/70">Streak:</span>
            <span className="font-bold text-purple-400">
              {stats.currentStreak}{" "}
              <span className="text-xs text-white/50">
                (best: {stats.bestStreak})
              </span>
            </span>
          </div>

          <div className="flex justify-between text-xs mt-3 pt-3 border-t border-white/10">
            <span className="text-white/50">Correct:</span>
            <span className="text-green-400">{stats.correctAttempts}</span>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-white/50">Missed:</span>
            <span className="text-red-400">{stats.missedCharacters}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-6 right-6 flex gap-3">
        <button
          onClick={handleTogglePause}
          className="glass-effect rounded-xl px-5 py-3 text-white font-semibold hover:bg-white/20 transition-all shadow-lg"
        >
          {isPaused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          onClick={handleReset}
          className="glass-effect rounded-xl px-5 py-3 text-white font-semibold hover:bg-white/20 transition-all shadow-lg"
        >
          🔄 Reset
        </button>
      </div>

      {/* Pause Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center">
            <div className="text-4xl font-bold mb-4">⏸ Paused</div>
            <div className="text-white/70">Press Resume to continue</div>
          </div>
        </div>
      )}

      {/* Decorative elements */}
      <div
        className="absolute top-32 right-20 w-3 h-3 bg-cyan-400/40 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "3s" }}
      />
      <div
        className="absolute bottom-40 right-32 w-2 h-2 bg-purple-400/50 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "4s", animationDelay: "1s" }}
      />
      <div
        className="absolute top-1/2 left-20 w-2 h-2 bg-pink-400/40 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "5s", animationDelay: "2s" }}
      />
    </div>
  )
}
