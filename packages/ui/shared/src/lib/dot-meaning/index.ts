/**
 * What a dot's colour means, on every screen of the phone (owner,
 * 2026-11-15, epics #3030 and #3029: "dot color should mean the same thing on
 * every screen"). A screen names the meaning; this table picks the hue, so no
 * two screens can give one hue two meanings, and its test refuses a hue used
 * twice. Each is a fixed hue, not a theme token: the themes put different
 * hues in the same chart slot (Mochi's sky is its fourth, Mochi Night's its
 * second), and a dot's meaning can't follow the theme (C411). The words
 * beside each dot still say what it means.
 *
 * Episodes (EPISODES2) says these three; Takes (#3029) adds its own, each in
 * a hue no other meaning has.
 */

/** Each thing a dot can say. */
export const DOT_MEANINGS = [
  /** Home has it, and it isn't out in the world yet. */
  "home",
  /** Out in the world: an episode on YouTube. */
  "out",
  /** Still being made. */
  "making",
] as const

export type DotMeaning = (typeof DOT_MEANINGS)[number]

/** The fixed hue each meaning takes, by its name beside it. */
const HUE = {
  home: "bg-sky-500", // sky
  out: "bg-emerald-500", // leaf
  making: "bg-muted-foreground", // grey
} as const satisfies Record<DotMeaning, string>

/** The class that colours a dot saying `meaning`. */
export const dotClass = (meaning: DotMeaning): string => HUE[meaning]
