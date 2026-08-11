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
}: ControlsProps): React.JSX.Element => {
  const themeClass =
    themeName === "Amber"
      ? "amber"
      : themeName === "Sky"
        ? "sky"
        : themeName === "Purple"
          ? "purple"
          : "cyan"

  // The four `text-slate-900` values below are the label on a saturated amber/sky/
  // purple/cyan gradient fill. The fill is fixed art direction, so its label
  // has to be fixed too — `text-primary-foreground` would invert to near-white
  // under a dark session theme and vanish into the button. The inactive branch
  // underneath is the themed one, and uses tokens.
  /* eslint-disable theme-protocol/no-structural-palette-color */
  const getButtonClass = (primary = false): string =>
    `px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 ${
      primary
        ? themeClass === "amber"
          ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40"
          : themeClass === "sky"
            ? "bg-gradient-to-r from-sky-400 to-sky-500 text-slate-900 shadow-lg shadow-sky-500/30 hover:shadow-xl hover:shadow-sky-500/40"
            : themeClass === "purple"
              ? "bg-gradient-to-r from-purple-400 to-purple-500 text-slate-900 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
              : "bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
        : `bg-card/80 text-${themeClass}-400 border-2 border-${themeClass}-500/50 hover:bg-accent/80 hover:border-${themeClass}-500/70 backdrop-blur-sm`
    }`
  /* eslint-enable theme-protocol/no-structural-palette-color */

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
