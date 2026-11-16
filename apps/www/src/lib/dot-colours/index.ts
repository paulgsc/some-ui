/**
 * What a status dot's colour means on the phone (the owner, 2026-11-15: "dot
 * color should mean the same thing on every screen"; #3030, #3029): one
 * table, keyed by meaning, that every phone screen drawing a status dot reads,
 * so a colour never stands for two things. Each is a fixed hue, not a theme
 * token: the themes put different hues in the same chart slot (Mochi's sky is
 * its fourth, Mochi Night's its second), and a dot's meaning can't follow
 * the theme. Words always go with a dot, so nothing is read from colour alone.
 * Its test holds that no two meanings share a hue. A screen with a meaning of
 * its own adds it here, in a hue no other meaning has.
 */

type Dot = {
  /** The hue's name, as the owner and the prototypes say it. */
  readonly hue: string
  /** The dot's fill. */
  readonly className: string
}

export const DOTS = {
  /** Kept on home, and not out in the world yet (on YouTube, say). */
  onHome: { hue: "sky", className: "bg-sky-500" },
  /** Out in the world: an episode on YouTube. */
  out: { hue: "leaf", className: "bg-emerald-500" },
  /** Still being made. */
  making: { hue: "grey", className: "bg-muted-foreground" },
} as const satisfies Record<string, Dot>

export type DotMeaning = keyof typeof DOTS
