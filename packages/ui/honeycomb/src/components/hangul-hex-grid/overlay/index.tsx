import { useCallback, useEffect, useRef, useState } from "react"
import { HangulHexCell } from "@honeycomb/components/hangul-hex-grid/hangul-hex-cell"
import type { HexCellData } from "@honeycomb/components/hex-grid"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  DisplayCharacter,
  GameStats,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

type CharacterWithLifetime = DisplayCharacter & { timeRemaining: number }

export const HangulHexGrid = (): React.JSX.Element => {
  const { isLoading, error, gameBridge, isInitialized } = useHangulGameWasm({
    autoStart: true,
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

  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null)
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ========================================================================
  // SPAWN CHARACTER
  // ========================================================================

  const spawnCharacter = useCallback(() => {
    if (!gameBridge) return

    const char = gameBridge.spawnCharacter()
    if (!char) return // Grid full

    setActiveCharacters((prev) => {
      const next = new Map(prev)
      next.set(char.cellId, {
        ...char,
        timeRemaining: 1,
      })
      return next
    })

    setTimingParams(gameBridge.getTimingParams())
  }, [gameBridge])

  // ========================================================================
  // UPDATE LIFETIMES & CHECK EXPIRATION
  // ========================================================================

  const updateCharacters = useCallback(() => {
    if (!gameBridge) return

    const expiredResult = gameBridge.checkExpired()
    const now = Date.now()
    const currentWindow = gameBridge.getCurrentTimeWindow()

    setActiveCharacters((prev) => {
      const next = new Map(prev)

      // Remove expired
      expiredResult.cellIds.forEach((cellId) => next.delete(cellId))

      // Update time remaining for active
      next.forEach((char, cellId) => {
        const age = now - char.spawnedAt
        const timeRemaining = Math.max(0, 1 - age / currentWindow)
        next.set(cellId, { ...char, timeRemaining })
      })

      return next
    })

    if (expiredResult.count > 0) {
      setStats(gameBridge.getStats())
      setTimingParams(gameBridge.getTimingParams())
    }
  }, [gameBridge])

  // ========================================================================
  // KEYBOARD INPUT
  // ========================================================================

  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return
      if (e.key === " ") return

      const now = Date.now()
      const match = keyboardManager.addKey(e.key, now)

      setKeyBuffer(keyboardManager.getBuffer())

      if (match) {
        const result = gameBridge.processKeyPress(match.keys)

        if (result.matched) {
          setActiveCharacters((prev) => {
            const next = new Map(prev)
            next.delete(result.cellId)
            return next
          })

          setLastPoints(result.points)
          setShowSuccessFeedback(true)
          setTimeout(() => setShowSuccessFeedback(false), 500)

          keyboardManager.clearBuffer()
          setKeyBuffer("")
        }

        setStats(gameBridge.getStats())
        setTimingParams(gameBridge.getTimingParams())
      }

      setTimeout(() => {
        if (keyboardManager.shouldClearBuffer(Date.now())) {
          keyboardManager.clearBuffer()
          setKeyBuffer("")
        }
      }, 350)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [gameBridge, keyboardManager, isPaused, isInitialized])

  // ========================================================================
  // SPAWN TIMER
  // ========================================================================

  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    spawnCharacter() // Initial spawn
    spawnTimerRef.current = setInterval(
      spawnCharacter,
      timingParams.spawnIntervalMs
    )

    return () => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current)
    }
  }, [
    spawnCharacter,
    timingParams.spawnIntervalMs,
    isPaused,
    gameBridge,
    isInitialized,
  ])

  // ========================================================================
  // UPDATE TIMER
  // ========================================================================

  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    updateTimerRef.current = setInterval(updateCharacters, 50)

    return () => {
      if (updateTimerRef.current) clearInterval(updateTimerRef.current)
    }
  }, [updateCharacters, isPaused, gameBridge, isInitialized])

  // ========================================================================
  // RESET
  // ========================================================================

  const handleReset = useCallback(() => {
    if (!gameBridge) return

    gameBridge.reset()
    keyboardManager.reset()
    setActiveCharacters(new Map())
    setStats(gameBridge.getStats())
    setTimingParams(gameBridge.getTimingParams())
    setKeyBuffer("")
    setIsPaused(false)
  }, [gameBridge, keyboardManager])

  // ========================================================================
  // LOADING STATE
  // ========================================================================

  if (isLoading) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center">
          <div className="text-2xl font-bold mb-4">Loading WASM...</div>
          <div className="text-white/70">Initializing game core</div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // ERROR STATE
  // ========================================================================

  if (error || !gameBridge) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center max-w-md">
          <div className="text-2xl font-bold mb-4 text-red-400">Error</div>
          <div className="text-white/70 mb-4">
            {error || "Failed to initialize game"}
          </div>
          <div className="text-sm text-white/50">
            Make sure the WASM module is built and available.
          </div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER
  // ========================================================================

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
      {/* Animated background */}
      <div
        className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10 animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      {/* Success feedback */}
      {showSuccessFeedback && (
        <div
          className="absolute text-4xl font-bold text-green-400 pointer-events-none z-50 animate-ping"
          style={{
            left: "50%",
            top: "50%",
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
        cells={hexCells}
        backgroundOpacity={0.08}
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
              className={`font-bold ${
                stats.accuracy >= 80
                  ? "text-green-400"
                  : stats.accuracy >= 60
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {stats.accuracy.toFixed(1)}%
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
            <span className="text-green-400">{stats.totalCorrect}</span>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-white/50">Missed:</span>
            <span className="text-red-400">{stats.totalMissed}</span>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-xs text-white/50 mb-1">Difficulty:</div>
            <div className="text-xs text-cyan-400">
              {timingParams.characterLifetimeMs < 2000
                ? "🔥 Hard"
                : timingParams.characterLifetimeMs < 3000
                  ? "⚡ Medium"
                  : "🌱 Easy"}
            </div>
            <div className="text-xs text-white/40 mt-1">
              {timingParams.showRomanization ? "💡 Hints ON" : "🎯 Hints OFF"}
            </div>
          </div>
        </div>
      </div>

      {/* Key Buffer */}
      {keyBuffer && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
          <div className="glass-effect rounded-xl px-6 py-3 text-white text-2xl font-mono font-bold">
            {keyBuffer}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-6 right-6 flex gap-3">
        <button
          onClick={() => setIsPaused((prev) => !prev)}
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

      {/* Instructions */}
      <div className="absolute bottom-6 left-6 glass-effect rounded-2xl px-6 py-4 text-white shadow-2xl max-w-md">
        <div className="text-sm space-y-2">
          <div className="font-bold text-cyan-400 mb-2">How to Play:</div>
          <p className="text-white/80 text-xs leading-relaxed">
            Type the QWERTY keys for each Hangul character before time runs out!
            Some characters need multiple keys (like{" "}
            <span className="font-mono">ho</span> → ㅙ).
          </p>
          <p className="text-white/60 text-xs mt-2">
            💡 Build streaks to increase difficulty and hide hints!
          </p>
        </div>
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

      {/* Decorative particles */}
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
