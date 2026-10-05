import { useEffect, useRef } from "react"
import { HANGUL_WORDS } from "@honeycomb/data"
import type { WordEntry } from "@honeycomb/data"
import type { HintTier } from "@honeycomb/hooks/use-prompt-escalation"
import { sayWord } from "@honeycomb/lib/hangul/speech"
import type { Stimulus } from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { WordProgress } from "@honeycomb/types/hangul-types"
import { useSpeaker } from "@some-ui/speech"

type PromptStationProps = {
  stimulus: Stimulus | null
  tier: HintTier
  /** The tracked word's masked-progress snapshot, shown alongside the icon. */
  progress: WordProgress | null
  /**
   * The word pool `stimulus.name` is looked up in: the same list the engine
   * was seeded with. Defaults to the bundled demo seed.
   */
  words?: Array<WordEntry>
}

/**
 * Prompt/Concept Station (ADR 0003 §2(d)): a corner-anchored overlay showing
 * the active word's stimulus and progress, with richer hints as the player
 * struggles: idle ("radio"), expanded ("TV"), then TTS and finally the Hangul
 * spelling per `usePromptEscalation`'s tier. Host-layer realizations of engine
 * primitives (canon Axiom 3.1); no engine type backs it.
 *
 * The masked word lives here, not over the board, which must stay
 * uninterrupted. Renders nothing for `Glyph` stimuli (single-jamo play).
 */
export const PromptStation = ({
  stimulus,
  tier,
  progress,
  words = HANGUL_WORDS,
}: PromptStationProps): React.JSX.Element | null => {
  const lastAutoPlayedTierRef = useRef<HintTier | null>(null)
  const speaker = useSpeaker()

  const entry =
    stimulus?.kind === "icon"
      ? words.find((word) => word.id === stimulus.name)
      : undefined

  // A hint for a word the learner has moved past is not said: waiting
  // behind another applet's line, it would play late, for the wrong word.
  useEffect(() => (): void => speaker?.stop(), [entry, speaker])

  useEffect(() => {
    if (!entry || tier === "idle" || tier === "icon") {
      lastAutoPlayedTierRef.current = null
      return
    }
    // Auto-play once per tier transition into "icon-tts" or beyond, not on
    // every re-render (usePromptEscalation ticks every 250ms).

    if (lastAutoPlayedTierRef.current !== tier) {
      lastAutoPlayedTierRef.current = tier
      sayWord(speaker, entry.ttsText, "next")
    }
  }, [entry, tier, speaker])

  if (stimulus?.kind !== "icon" || !entry) return null

  const isExpanded = tier !== "idle"

  return (
    <div className="absolute bottom-6 right-6 z-40 pointer-events-none">
      {isExpanded ? (
        <div className="glass-effect rounded-2xl px-5 py-4 shadow-2xl bg-white/5 flex flex-col items-center gap-2 pointer-events-auto min-w-[140px]">
          <div className="text-6xl" aria-hidden>
            {entry.icon}
          </div>

          {/* Masked-word progress - baseline feedback, not an escalating
              hint, so it shows from the moment the station expands. */}
          {progress && progress.answerGlyphs.length > 1 && (
            <div className="flex gap-1.5 font-mono text-lg font-bold">
              {progress.answerGlyphs.map((glyph, index) => {
                const isRevealed = index < progress.cursor
                return (
                  <span
                    // eslint-disable-next-line react/no-array-index-key -- token position within one challenge's fixed-length answer is a stable identity here
                    key={index}
                    className={isRevealed ? "text-white" : "text-white/25"}
                  >
                    {isRevealed ? glyph : "_"}
                  </span>
                )
              })}
            </div>
          )}

          {(tier === "icon-tts" || tier === "icon-tts-hangul") && (
            <button
              type="button"
              onClick={() => sayWord(speaker, entry.ttsText, "now")}
              className="text-xs font-semibold text-white/80 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 transition-colors"
            >
              🔊 Replay
            </button>
          )}

          {/* Last-resort hint: the word in Hangul, which is what the player
              has to produce. Romanization is deliberately not shown - see
              usePromptEscalation's header comment. */}
          {tier === "icon-tts-hangul" && (
            <div className="text-center">
              <div className="text-xl font-bold tracking-wide text-white/85">
                {entry.word}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Idle "radio" state: a minimal, audio-first footprint.
        <div className="size-3 rounded-full bg-white/30 animate-pulse" />
      )}
    </div>
  )
}
