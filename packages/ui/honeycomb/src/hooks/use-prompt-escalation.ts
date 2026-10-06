import { useEffect, useState } from "react"

/**
 * Hint tiers for the Prompt/Concept Station, computed client-side from miss
 * count and elapsed time on the active challenge (canon Axiom 3.1: the engine
 * stays free of hint policy).
 *
 * The top tier is `icon-tts-hangul`, not romanization: the player types
 * Hangul, and "sagwa" would make them re-derive 사과, the very skill the hint
 * is meant to unblock.
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
  // Written only in the interval callback: `Date.now()` is impure, so not
  // during render or in the effect body.

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
