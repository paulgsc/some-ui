// ── Spotlight ─────────────────────────────────────────────────────────────────
// What the card shows for a few seconds after something changes: which change
// earns the spotlight, and the words and glyphs it is shown with. Pure — the
// Spotlight component renders a SpotlightView, DramaCard decides when.

import { MOODS } from "@drama/logic/content/constants"
import { likelihoodLabel, starsFor } from "@drama/logic/content/utils"
import type { CardState, Spotlight } from "@drama/types"

/** How long a change stays the card's face. A newer change restarts it. */
export const SPOTLIGHT_MS = 4_000

export type SpotlightView = {
  glyph: string
  headline: string
  detail: string
  // The effect the card plays: the mood itself, or which way a verdict moved.
  tone: string
}

type Verdicts = Pick<CardState, "rating" | "completionLikelihood">

/**
 * The spotlight a verdict change earns, or null when neither moved. When both
 * moved at once (a popup save), the rating wins: it is the one a viewer reads.
 */
export function verdictSpotlight(
  prev: Verdicts,
  next: Verdicts
): Spotlight | null {
  if (next.rating !== prev.rating) {
    return {
      kind: "rating",
      value: next.rating,
      delta: next.rating - prev.rating,
    }
  }
  if (next.completionLikelihood !== prev.completionLikelihood) {
    return {
      kind: "finish",
      value: next.completionLikelihood,
      delta: next.completionLikelihood - prev.completionLikelihood,
    }
  }
  return null
}

/** The glyph for a likelihood to finish, one per likelihoodLabel bucket. */
export function likelihoodGlyph(p: number): string {
  if (p >= 0.85) return "🏁"
  if (p >= 0.6) return "🍿"
  if (p >= 0.35) return "🤔"
  return "💤"
}

/** "12:05" for a video time in seconds. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(s / 60))
  const ss = String(s % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

function signed(delta: number, digits: number, unit = ""): string {
  const arrow = delta > 0 ? "▲" : "▼"
  return `${arrow} ${Math.abs(delta).toFixed(digits)}${unit}`
}

export function spotlightView(s: Spotlight): SpotlightView {
  if (s.kind === "mood") {
    const m = MOODS.find((x) => x.type === s.mood)
    const pips = "●".repeat(s.intensity) + "○".repeat(3 - s.intensity)
    const at = s.videoTime === null ? "" : ` · at ${clockOf(s.videoTime)}`
    return {
      glyph: m?.emoji ?? "",
      headline: m?.label ?? s.mood,
      detail: `${pips}${at}`,
      tone: s.mood,
    }
  }
  const tone = s.delta >= 0 ? "rise" : "fall"
  if (s.kind === "rating") {
    return {
      glyph: "★",
      headline: s.value.toFixed(1),
      detail: `${starsFor(s.value)}  ${signed(s.delta, 1)}`,
      tone,
    }
  }
  const pct = Math.round(s.value * 100)
  return {
    glyph: likelihoodGlyph(s.value),
    headline: likelihoodLabel(s.value),
    detail: `${pct}% to finish  ${signed(s.delta * 100, 0, "%")}`,
    tone,
  }
}
