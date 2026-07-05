import type {
  GameStats,
  GameStatus,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

type GameOverModalProps = {
  isOpen: boolean
  status: GameStatus | null
  stats: GameStats & { accuracy: number }
  onContinue: () => void
}

export const GameOverModal = ({
  isOpen,
  status,
  stats,
  onContinue,
}: GameOverModalProps): React.JSX.Element | null => {
  if (!isOpen || !status) return null

  const isComplete = status.isComplete
  const isTimeout = status.isTimedOut

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      onContinue()
    }
  }

  return (
    <div
      className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50"
      onClick={onContinue}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Close modal overlay"
    >
      <div
        className="glass-effect rounded-3xl px-12 py-10 text-white text-center max-w-md"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* Title */}
        <div className="text-5xl mb-4">
          {isComplete ? "🎉" : isTimeout ? "⏰" : "🎮"}
        </div>
        <div className="text-3xl font-bold mb-6">
          {isComplete ? "Complete!" : isTimeout ? "Time's Up!" : "Game Over"}
        </div>

        {/* Stats Summary */}
        <div className="space-y-3 mb-8 text-left bg-white/5 rounded-xl p-6">
          <div className="flex justify-between items-baseline">
            <span className="text-white/70">Final Score:</span>
            <span className="text-2xl font-bold text-cyan-400">
              {stats.score}
            </span>
          </div>

          <div className="flex justify-between items-baseline">
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

          <div className="flex justify-between items-baseline">
            <span className="text-white/70">Best Streak:</span>
            <span className="font-bold text-purple-400">
              {stats.bestStreak}
            </span>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-between text-sm">
            <div>
              <div className="text-white/50 text-xs">Correct</div>
              <div className="text-green-400 font-bold">
                {stats.totalCorrect}
              </div>
            </div>
            <div>
              <div className="text-white/50 text-xs">Missed</div>
              <div className="text-red-400 font-bold">{stats.totalMissed}</div>
            </div>
          </div>

          {/* Fixed unnecessary condition by removing optional chain if type guarantees it */}
          <div className="pt-3 border-t border-white/10">
            <div className="text-white/50 text-xs mb-1">Completion</div>
            <div className="text-cyan-400 font-bold">
              {status.progress.completedKeys} / {status.progress.totalKeys} (
              {status.progress.completionPercentage.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onContinue}
          className="w-full glass-effect rounded-xl px-8 py-4 text-white font-semibold hover:bg-white/20 active:scale-95 transition-all shadow-lg text-lg"
        >
          🔄 Play Again
        </button>
      </div>
    </div>
  )
}
