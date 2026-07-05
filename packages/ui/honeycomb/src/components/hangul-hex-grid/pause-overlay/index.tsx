import type { JSX, KeyboardEvent } from "react"

type PauseOverlayProps = {
  isPaused: boolean
  onResume: () => void
}

export const PauseOverlay = ({
  isPaused,
  onResume,
}: PauseOverlayProps): JSX.Element | null => {
  if (!isPaused) return null

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      onResume()
    }
  }

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40"
      onClick={onResume}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Resume game overlay"
    >
      <div
        className="glass-effect rounded-3xl px-12 py-8 text-white text-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="text-4xl font-bold mb-4">⏸ Paused</div>
        <div className="text-white/70 mb-6">
          Click anywhere or press Resume to continue
        </div>
        <button
          onClick={onResume}
          className="glass-effect rounded-xl px-8 py-3 text-white font-semibold hover:bg-white/20 active:scale-95 transition-all shadow-lg"
        >
          ▶ Resume Game
        </button>
      </div>
    </div>
  )
}
