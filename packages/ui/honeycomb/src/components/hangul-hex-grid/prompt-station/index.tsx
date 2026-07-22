import { useEffect, useRef } from "react"
import { HANGUL_WORDS } from "@honeycomb/data"
import type { HintTier } from "@honeycomb/hooks/use-prompt-escalation"
import { speak } from "@honeycomb/lib/hangul/speech"
import type { Stimulus } from "@honeycomb/lib/hangul/wasm-game-bridge"

type PromptStationProps = {
  stimulus: Stimulus | null
  tier: HintTier
}

/**
 * Prompt/Concept Station (ADR 0003 §2(d), #762): a persistent, corner-anchored
 * overlay rendering the active word challenge's stimulus, with progressively
 * richer hints as the player struggles. Idle ("radio") state is a minimal
 * footprint; it expands ("TV") once a word challenge is active, then layers
 * in TTS playback and a romanization caption per `usePromptEscalation`'s
 * tier. Both are host-layer realizations of engine primitives (canon Axiom
 * 3.1) - no new engine type backs this component.
 *
 * Renders nothing for `Glyph` stimuli (today's single-jamo play): this
 * overlay only exists to carry a non-text prompt, so ordinary jamo modes are
 * unaffected by its presence.
 */
export const PromptStation = ({
  stimulus,
  tier,
}: PromptStationProps): React.JSX.Element | null => {
  const lastAutoPlayedTierRef = useRef<HintTier | null>(null)

  const entry =
    stimulus?.kind === "icon"
      ? HANGUL_WORDS.find((word) => word.id === stimulus.name)
      : undefined

  useEffect(() => {
    if (!entry || tier === "idle" || tier === "icon") {
      lastAutoPlayedTierRef.current = null
      return
    }
    // Auto-play once per tier transition into "icon-tts" or beyond, not on
    // every re-render (e.g. the 250ms elapsed-time tick inside
    // usePromptEscalation) while that tier is active.
    if (lastAutoPlayedTierRef.current !== tier) {
      lastAutoPlayedTierRef.current = tier
      speak(entry.ttsText)
    }
  }, [entry, tier])

  if (stimulus?.kind !== "icon" || !entry) return null

  const isExpanded = tier !== "idle"

  return (
    <div className="absolute bottom-6 right-6 z-40 pointer-events-none">
      {isExpanded ? (
        <div className="glass-effect rounded-2xl px-5 py-4 shadow-2xl bg-white/5 flex flex-col items-center gap-2 pointer-events-auto min-w-[140px]">
          <div className="text-6xl" aria-hidden>
            {entry.icon}
          </div>

          {(tier === "icon-tts" || tier === "icon-tts-romanization") && (
            <button
              type="button"
              onClick={() => speak(entry.ttsText)}
              className="text-xs font-semibold text-white/80 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 transition-colors"
            >
              🔊 Replay
            </button>
          )}

          {tier === "icon-tts-romanization" && (
            <div className="text-center">
              <div className="text-xs text-white/60 italic">
                {entry.romanization}
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
