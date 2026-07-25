type SuccessFeedbackProps = {
  show: boolean
  points: number
  /**
   * The completed word's glyph text, set only for a multi-token match
   * (ADR 0003 §2(c)'s "Celebrate" ceremony - the reveal phase after a word
   * challenge completes). Undefined/empty for ordinary single-jamo play,
   * which keeps today's points-only popup unchanged.
   */
  word?: string
}

export const SuccessFeedback = ({
  show,
  points,
  word,
}: SuccessFeedbackProps): React.JSX.Element | null => {
  if (!show) return null

  return (
    <div
      className="absolute flex flex-col items-center gap-1 pointer-events-none z-50 animate-ping"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      {word && (
        <div className="text-3xl font-bold text-white font-sans">{word}</div>
      )}
      <div className="text-4xl font-bold text-green-400">+{points}</div>
    </div>
  )
}
