type KeyBufferDisplayProps = {
  buffer: string
  ambiguousCharacters?: Array<string>
}

export const KeyBufferDisplay = ({
  buffer,
  ambiguousCharacters = [],
}: KeyBufferDisplayProps): React.JSX.Element | null => {
  if (!buffer) return null

  const isAmbiguous = ambiguousCharacters.length > 0

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
      <div
        className={`glass-effect rounded-xl px-6 py-3 shadow-2xl transition-all duration-200 ${
          isAmbiguous
            ? "ring-2 ring-yellow-400/50 bg-yellow-500/10"
            : "bg-white/5"
        }`}
      >
        {/* Current buffer */}
        <div className="text-white text-2xl font-mono font-bold text-center">
          {buffer}
        </div>

        {/* Ambiguous input indicator */}
        {isAmbiguous && (
          <div className="mt-2 text-center">
            <div className="text-xs text-yellow-400/80 mb-1">
              Multiple matches possible:
            </div>
            <div className="flex gap-2 justify-center">
              {ambiguousCharacters.map((char, i) => (
                <span
                  key={i}
                  className="text-lg font-bold text-yellow-400 px-2 py-1 rounded bg-yellow-400/10"
                >
                  {char}
                </span>
              ))}
            </div>
            <div className="text-xs text-white/50 mt-1">
              Type next key to clarify
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
