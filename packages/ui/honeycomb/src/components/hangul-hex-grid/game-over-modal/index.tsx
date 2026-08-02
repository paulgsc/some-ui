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

/**
 * The end-of-run summary, sized to fit the board it covers.
 *
 * Everything here is fixed-cardinality - one verdict line, five figures, one
 * button - so `docs/ui-fit`'s first question ("can this just fit?") has a
 * plain yes, and the panel takes no height cap and no scrollbar. It used to
 * take both, and at the 500px board the stories render it was genuinely
 * overflowing them: a stacked emoji, a stacked headline, and five full-width
 * label/value rows at `p-6` came to roughly 550px of content. The fix is the
 * layout, not a scroll container - the verdict is one line, the figures are a
 * 2-up hero over a 3-up footnote, and completion is a single row.
 *
 * The numbers are `tabular-nums` for the same reason: the grid's height must
 * not depend on the run it is describing.
 */
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
        className="glass-effect rounded-3xl mx-4 w-full max-w-md px-5 py-5 sm:px-8 sm:py-7 text-white text-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* Verdict. The emoji sits beside the headline rather than above it:
            two stacked display lines were the single biggest block of height
            here, and they say one thing between them. */}
        <div className="flex items-center justify-center gap-3 mb-4 sm:mb-5">
          <span className="text-4xl sm:text-5xl leading-none" aria-hidden>
            {isComplete ? "🎉" : isTimeout ? "⏰" : "🎮"}
          </span>
          <span className="text-2xl sm:text-3xl font-bold">
            {isComplete ? "Complete!" : isTimeout ? "Time's Up!" : "Game Over"}
          </span>
        </div>

        {/* Stats summary, laid out by weight rather than as one column of
            label/value rows. Score and accuracy are what the player came for,
            so they get the display sizes; the rest reads as a footnote. Every
            figure is a fixed-width number, so the grid's height is the same
            for a 12-point run as for a 12,000-point one. */}
        <div className="bg-white/5 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5">
          <div className="grid grid-cols-2 divide-x divide-white/10">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-cyan-400 tabular-nums">
                {stats.score}
              </div>
              <div className="text-white/50 text-[11px] uppercase tracking-wider">
                Score
              </div>
            </div>
            <div>
              <div
                className={`text-2xl sm:text-3xl font-bold tabular-nums ${
                  stats.accuracy >= 80
                    ? "text-green-400"
                    : stats.accuracy >= 60
                      ? "text-yellow-400"
                      : "text-red-400"
                }`}
              >
                {stats.accuracy.toFixed(1)}%
              </div>
              <div className="text-white/50 text-[11px] uppercase tracking-wider">
                Accuracy
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2">
            <div>
              <div className="text-base font-bold text-purple-400 tabular-nums">
                {stats.bestStreak}
              </div>
              <div className="text-white/50 text-[11px]">Best streak</div>
            </div>
            <div>
              <div className="text-base font-bold text-green-400 tabular-nums">
                {stats.totalCorrect}
              </div>
              <div className="text-white/50 text-[11px]">Correct</div>
            </div>
            <div>
              <div className="text-base font-bold text-red-400 tabular-nums">
                {stats.totalMissed}
              </div>
              <div className="text-white/50 text-[11px]">Missed</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 flex items-baseline justify-between text-xs">
            <span className="text-white/50">Completion</span>
            <span className="text-cyan-400 font-bold tabular-nums">
              {status.progress.completedKeys} / {status.progress.totalKeys} ·{" "}
              {status.progress.completionPercentage.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onContinue}
          className="w-full glass-effect rounded-xl px-8 py-3 text-white font-semibold hover:bg-white/20 active:scale-95 transition-all shadow-lg"
        >
          🔄 Play Again
        </button>
      </div>
    </div>
  )
}
