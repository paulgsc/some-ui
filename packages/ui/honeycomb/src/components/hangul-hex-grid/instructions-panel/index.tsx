import type { GameMode } from "@honeycomb/lib/hangul/wasm-game-bridge"

type InstructionsPanelProps = {
  mode: GameMode
}

export const InstructionsPanel = ({
  mode,
}: InstructionsPanelProps): React.JSX.Element => {
  return (
    <div className="absolute bottom-6 left-6 glass-effect rounded-2xl px-6 py-4 text-white shadow-2xl max-w-md">
      <div className="text-sm space-y-2">
        <h3 className="font-bold text-cyan-400 mb-2">How to Play:</h3>
        <p className="text-white/80 text-xs leading-relaxed">
          Type the QWERTY keys for each Hangul character before time runs out!
          Some characters need multiple keys (like{" "}
          <span className="font-mono bg-white/10 px-1 rounded">ho</span> → ㅙ).
        </p>
        {mode === "completion" ? (
          <p className="text-white/60 text-xs mt-2">
            🎯 Complete all characters before time expires!
          </p>
        ) : (
          <p className="text-white/60 text-xs mt-2">
            💡 Build streaks to increase difficulty and hide hints!
          </p>
        )}
      </div>
    </div>
  )
}
