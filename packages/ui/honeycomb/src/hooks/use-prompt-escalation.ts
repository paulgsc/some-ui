import { useEffect, useState } from "react"

/**
 * Hint tiers for the Prompt/Concept Station (#762). Escalation is computed
 * client-side purely from already-observable signals - miss count and
 * elapsed time on the currently active challenge - never a new engine-owned
 * concept (canon Axiom 3.1: the engine stays free of UI/hint policy).
 *
 * The top tier is `icon-tts-hangul`, not romanization: the target the player
 * is typing is Hangul, so the last-resort hint has to be the thing they need
 * to produce. Romanization is a Latin-alphabet crutch that teaches the wrong
 * mapping - the player reads "sagwa" and has to re-derive 사과 to get anywhere,
 * which is the exact skill the hint was supposed to unblock.
 */
export type HintTier = "idle" | "icon" | "icon-tts" | "icon-tts-hangul"

const TTS_MISS_THRESHOLD = 1
const TTS_ELAPSED_MS = 3000
const SPELLING_MISS_THRESHOLD = 2
const SPELLING_ELAPSED_MS = 6000
const TICK_MS = 250

type UsePromptEscalationProps = {
  /** Is a word challenge (a `Stimulus` other than `Glyph`) currently active? */
  active: boolean
  /** `revealedAtMs`-equivalent epoch ms of when the tracked challenge spawned. */
  spawnedAt: number | undefined
  /** Misses observed since that challenge spawned (reset by the caller on each new spawn). */
  missCount: number
}

export function usePromptEscalation({
  active,
  spawnedAt,
  missCount,
}: UsePromptEscalationProps): HintTier {
  // Only ever written from inside the interval's own callback (never
  // synchronously in the effect body) - `Date.now()` is impure, so it can
  // only be called in response to an external event (the timer firing), not
  // during render or as a direct effect-body side effect.
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect((): (() => void) | undefined => {
    if (!active || spawnedAt === undefined) {
      return undefined
    }
    const id = setInterval(() => {
      setElapsedMs(Date.now() - spawnedAt)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active, spawnedAt])

  if (!active || spawnedAt === undefined) return "idle"

  if (
    missCount >= SPELLING_MISS_THRESHOLD ||
    elapsedMs >= SPELLING_ELAPSED_MS
  ) {
    return "icon-tts-hangul"
  }

  if (missCount >= TTS_MISS_THRESHOLD || elapsedMs >= TTS_ELAPSED_MS) {
    return "icon-tts"
  }

  return "icon"
}
