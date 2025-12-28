type ControlButtonsProps = {
  isPaused: boolean
  onTogglePause: () => void
  onReset: () => void
}

export const ControlButtons = ({
  isPaused,
  onTogglePause,
  onReset,
}: ControlButtonsProps): React.JSX.Element => {
  return (
    <div className="absolute top-6 right-6 flex gap-3">
      <button
        onClick={onTogglePause}
        className="glass-effect rounded-xl px-5 py-3 text-white font-semibold hover:bg-white/20 active:scale-95 transition-all shadow-lg"
      >
        {isPaused ? "▶ Resume" : "⏸ Pause"}
      </button>
      <button
        onClick={onReset}
        className="glass-effect rounded-xl px-5 py-3 text-white font-semibold hover:bg-white/20 active:scale-95 transition-all shadow-lg"
      >
        🔄 Reset
      </button>
    </div>
  )
}
