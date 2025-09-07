type ControlsProps = {
  isActive: boolean
  themeName: string
  onToggle: () => void
  onTest: () => void
  onChangeTheme: () => void
}

export const VoiceAvatarControls = ({
  isActive,
  themeName,
  onToggle,
  onTest,
  onChangeTheme,
}: ControlsProps) => {
  const themeClass =
    themeName === "Amber"
      ? "amber"
      : themeName === "Sky"
        ? "sky"
        : themeName === "Purple"
          ? "purple"
          : "cyan"

  const getButtonClass = (primary = false) =>
    `px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 ${
      primary
        ? themeClass === "amber"
          ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40"
          : themeClass === "sky"
            ? "bg-gradient-to-r from-sky-400 to-sky-500 text-slate-900 shadow-lg shadow-sky-500/30 hover:shadow-xl hover:shadow-sky-500/40"
            : themeClass === "purple"
              ? "bg-gradient-to-r from-purple-400 to-purple-500 text-slate-900 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
              : "bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
        : `bg-slate-800/80 text-${themeClass}-400 border-2 border-${themeClass}-500/50 hover:bg-slate-700/80 hover:border-${themeClass}-500/70 backdrop-blur-sm`
    }`

  return (
    <div className="mt-16 flex gap-6">
      <button onClick={onToggle} className={getButtonClass(true)}>
        {isActive ? "■ Stop Voice" : "▶ Start Voice"}
      </button>
      <button onClick={onTest} className={getButtonClass(false)}>
        ◉ Test Voice
      </button>
      <button onClick={onChangeTheme} className={getButtonClass(false)}>
        🎨 Change Theme
      </button>
    </div>
  )
}
