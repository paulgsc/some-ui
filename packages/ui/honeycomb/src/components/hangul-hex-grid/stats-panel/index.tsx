import { useState } from "react"
import type { JSX } from "react"
import type {
  GameMode,
  GameProgress,
  GameStats,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

type StatsPanelProps = {
  stats: GameStats & { accuracy: number }
  timingParams: TimingParams
  currentTimeWindow: number
  mode: GameMode
  timeRemaining?: number
  progress?: GameProgress
  /** The streak threshold that hides romanization hints, per the active difficulty. @default 5 */
  hideRomanizationStreak?: number
}

export const StatsPanel = ({
  stats,
  timingParams,
  currentTimeWindow,
  mode,
  timeRemaining,
  progress,
  hideRomanizationStreak = 5,
}: StatsPanelProps): JSX.Element => {
  const [showDetails, setShowDetails] = useState(false)

  const getDifficultyLabel = (): string => {
    if (timingParams.characterLifetimeMs < 2000) return "🔥 Hard"
    if (timingParams.characterLifetimeMs < 3000) return "⚡ Medium"
    return "🌱 Easy"
  }

  const getAccuracyColor = (): string => {
    if (stats.accuracy >= 80) return "text-green-400"
    if (stats.accuracy >= 60) return "text-yellow-400"
    return "text-red-400"
  }

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="absolute top-2 start-2 sm:top-8 sm:start-6 glass-effect rounded-2xl px-3 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-white shadow-2xl w-fit max-w-[calc(100%-1rem)] sm:max-w-xs lg:max-w-sm max-h-[calc(100%-1rem)] overflow-y-auto">
      {/* Header - always visible */}
      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
        <h2 className="text-base sm:text-lg lg:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          한글 타이핑
        </h2>
        <div className="text-xs px-2 py-1 rounded-full bg-white/10 text-cyan-400 font-semibold shrink-0">
          {mode === "completion" ? "📋 Complete" : "♾️ Endless"}
        </div>
      </div>

      {/* Primary Stats - Compact HUD on mobile, list on larger screens */}
      <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-3 gap-y-1 sm:gap-y-2">
        {/* Score */}
        <div className="flex sm:justify-between sm:items-baseline">
          <span className="hidden sm:inline text-white/70 text-sm">Score:</span>
          <span className="font-bold text-base sm:text-xl lg:text-2xl text-cyan-400">
            {stats.score}
            <span className="sm:hidden text-xs text-white/50 ml-1">pts</span>
          </span>
        </div>

        {/* Accuracy */}
        <div className="flex sm:justify-between sm:items-baseline">
          <span className="hidden sm:inline text-white/70 text-sm">
            Accuracy:
          </span>
          <span
            className={`font-bold text-base sm:text-lg lg:text-xl ${getAccuracyColor()}`}
          >
            {stats.accuracy.toFixed(1)}%
          </span>
        </div>

        {/* Streak */}
        <div className="flex sm:justify-between sm:items-baseline col-span-2 sm:col-span-1">
          <span className="hidden sm:inline text-white/70 text-sm">
            Streak:
          </span>
          <span className="font-bold text-purple-400">
            🔥 {stats.currentStreak}
            <span className="hidden sm:inline text-xs text-white/50 ml-1">
              (best: {stats.bestStreak})
            </span>
          </span>
        </div>

        {/* Timer - only in completion mode */}
        {mode === "completion" && timeRemaining !== undefined && (
          <div className="flex sm:justify-between sm:items-baseline col-span-2 sm:col-span-1">
            <span className="hidden sm:inline text-white/70 text-sm">
              Time:
            </span>
            <span className="font-mono text-base sm:text-xl lg:text-2xl font-bold text-yellow-400">
              {formatTime(timeRemaining)}
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar - completion mode */}
      {mode === "completion" && progress && (
        <div className="mt-2 sm:mt-3 sm:pb-3 sm:border-b sm:border-white/10">
          <div className="hidden sm:flex justify-between text-xs mb-1">
            <span className="text-white/70">Progress:</span>
            <span className="text-cyan-400 font-semibold">
              {progress.completedKeys} / {progress.totalKeys}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-300"
              style={{ width: `${progress.completionPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Secondary Stats - collapsible on mobile/tablet, always visible on desktop */}
      <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="lg:hidden flex items-center justify-between w-full text-xs text-white/50 hover:text-white/70 transition-colors"
          aria-expanded={showDetails}
          aria-controls="stats-details"
        >
          <span>Details</span>
          <svg
            className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <div
          id="stats-details"
          className={`${showDetails ? "block" : "hidden"} lg:block mt-2 space-y-1 text-xs`}
        >
          <div className="flex justify-between">
            <span className="text-white/50">Correct:</span>
            <span className="text-green-400">{stats.totalCorrect}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-white/50">Missed:</span>
            <span className="text-red-400">{stats.totalMissed}</span>
          </div>

          <div className="flex justify-between pt-2 border-t border-white/10">
            <span className="text-white/50">Difficulty:</span>
            <span className="text-cyan-400">{getDifficultyLabel()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-white/50">Time Window:</span>
            <span className="text-cyan-400">{currentTimeWindow}ms</span>
          </div>

          <div className="flex justify-between pt-2 border-t border-white/10">
            <span className="text-white/50">Romanization:</span>
            <span
              className={
                timingParams.showRomanization
                  ? "text-yellow-400"
                  : "text-green-400"
              }
            >
              {timingParams.showRomanization ? "SHOWN" : "HIDDEN"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-white/50">Streak to hide:</span>
            <span className="text-cyan-400">
              {stats.currentStreak} / {hideRomanizationStreak}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
