/**
 * What a dot's colour means, on every screen of the phone (owner,
 * 2026-11-15, epics #3030 and #3029: "dot color should mean the same thing on
 * every screen"). A screen names the meaning; this table picks the theme's
 * token, so within a theme no two screens can give one colour two meanings,
 * and its test refuses a token used twice (C411). The words beside each dot
 * still say what it means.
 *
 * Episodes (EPISODES2) says the first three; Takes (#3029) adds on this phone
 * (C425). Each meaning takes a token no other meaning has; TAKES4 adds the
 * filed issue's states the same way.
 */

/** Each thing a dot can say. */
export const DOT_MEANINGS = [
  /** Home has it, and it isn't out in the world yet. */
  "home",
  /** Out in the world: an episode on YouTube. */
  "out",
  /** Still being made. */
  "making",
  /** Only this phone has it, until home does (Takes, #3029). */
  "phone",
] as const

export type DotMeaning = (typeof DOT_MEANINGS)[number]

/** The theme token each meaning takes (Mochi Night's names beside). */
const HUE = {
  home: "bg-chart-2", // sky
  out: "bg-chart-3", // leaf
  making: "bg-muted-foreground", // grey
  phone: "bg-chart-4", // stone
} as const satisfies Record<DotMeaning, string>

/** The class that colours a dot saying `meaning`. */
export const dotClass = (meaning: DotMeaning): string => HUE[meaning]
