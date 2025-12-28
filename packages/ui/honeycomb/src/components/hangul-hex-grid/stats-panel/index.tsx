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
}

export const StatsPanel = ({
  stats,
  timingParams,
  currentTimeWindow,
  mode,
  timeRemaining,
  progress,
}: StatsPanelProps): React.JSX.Element => {
  const getDifficultyLabel = () => {
    if (timingParams.characterLifetimeMs < 2000) return "🔥 Hard"
    if (timingParams.characterLifetimeMs < 3000) return "⚡ Medium"
    return "🌱 Easy"
  }

  const getAccuracyColor = () => {
    if (stats.accuracy >= 80) return "text-green-400"
    if (stats.accuracy >= 60) return "text-yellow-400"
    return "text-red-400"
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="absolute top-8 start-6 glass-effect rounded-2xl px-6 py-4 text-white shadow-2xl max-w-fit">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          한글 타이핑
        </h2>
        <div className="text-xs px-2 py-1 rounded-full bg-white/10 text-cyan-400 font-semibold">
          {mode === "completion" ? "📋 Complete" : "♾️ Endless"}
        </div>
      </div>

      {/* Timer and Progress (Completion Mode) */}
      {mode === "completion" && (
        <div className="mb-3 pb-3 border-b border-white/10">
          {timeRemaining !== undefined && (
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-white/70 text-sm">Time:</span>
              <span className="font-mono text-xl font-bold text-yellow-400">
                {formatTime(timeRemaining)}
              </span>
            </div>
          )}

          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
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
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-white/70">Score:</span>
          <span className="font-bold text-xl text-cyan-400">{stats.score}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="text-white/70">Accuracy:</span>
          <span className={`font-bold ${getAccuracyColor()}`}>
            {stats.accuracy.toFixed(1)}%
          </span>
        </div>

        <div className="flex justify-between items-baseline">
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

        <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
          <div className="text-xs text-white/50">Difficulty:</div>
          <div className="text-xs text-cyan-400">{getDifficultyLabel()}</div>

          <div className="flex justify-between text-xs">
            <span className="text-white/50">Time Window:</span>
            <span className="text-cyan-400">{currentTimeWindow}ms</span>
          </div>

          <div className="flex justify-between text-xs pt-2 border-t border-white/10">
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

          <div className="flex justify-between text-xs">
            <span className="text-white/50">Streak to hide:</span>
            <span className="text-cyan-400">{stats.currentStreak} / 5</span>
          </div>
        </div>
      </div>
    </div>
  )
}
