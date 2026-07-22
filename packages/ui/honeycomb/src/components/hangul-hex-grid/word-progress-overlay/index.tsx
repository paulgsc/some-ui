import type { WordProgress } from "@honeycomb/types/hangul-types"

type WordProgressOverlayProps = {
  progress: WordProgress | null
}

/**
 * Masked-word feedback overlay (ADR 0003 §2(d), #426): blanks that reveal
 * per-jamo as the tracked challenge's cursor advances. Structurally the same
 * centered, pointer-events-none, glass-effect card as `KeyBufferDisplay`,
 * just driven by word-level progress instead of the raw keystroke buffer -
 * the two coexist (this sits below the buffer display) since a player is
 * still typing individual keys into that buffer while this shows how much
 * of the whole word they've locked in.
 */
export const WordProgressOverlay = ({
  progress,
}: WordProgressOverlayProps): React.JSX.Element | null => {
  if (!progress || progress.answerGlyphs.length <= 1) return null

  const { answerGlyphs, cursor } = progress

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 pointer-events-none z-40">
      <div className="glass-effect rounded-xl px-6 py-3 shadow-2xl bg-white/5">
        <div className="flex gap-2 justify-center font-mono text-2xl font-bold">
          {answerGlyphs.map((glyph, index) => {
            const isRevealed = index < cursor
            return (
              <span
                // eslint-disable-next-line react/no-array-index-key -- token position within one challenge's fixed-length answer is a stable identity here
                key={index}
                className={
                  isRevealed
                    ? "text-white transition-colors duration-200"
                    : "text-white/25"
                }
              >
                {isRevealed ? glyph : "_"}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
