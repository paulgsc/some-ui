/**
 * The Soundbites page's own words about the six it keeps: what the next
 * one replaces at the cap, and why. One pure table, in the person's terms
 * (CLAUDE.md, "State in the person's terms"); a take's own words are the
 * take pattern's (`TAKE_WORDS`).
 */
import type { Soundbite } from "./types"

/** Which kept one the next replaces: the one picked, or by its standing. */
export type ReplacedBy =
  | "picked"
  | NonNullable<Soundbite["standing"]>
  | "current"

export const SOUNDBITE_WORDS = {
  /** Before the time of the one the next replaces. */
  fullReplaces: "Full. Your next one replaces",
  /** After that time: why that one, in the order room is made (`./policy`). */
  whichGoes: {
    picked: "",
    "set-aside": ", one you set aside",
    earlier: ", an earlier take",
    current: ", the oldest home has",
  } satisfies Readonly<Record<ReplacedBy, string>>,
  pickAnother: ". Pick another below to replace that one instead.",
  fullNoneHeld:
    "Full. These stay on this phone until a home it's paired with has them, and then your next one replaces one home has: one you set aside first, then an earlier take, then the oldest.",
  unreadable:
    "Couldn't read what's on this phone. If it is full, your next one replaces one home has, or isn't kept while home has none.",
} as const

/** Why the next one replaces `replaced`: the person's pick, or its standing. */
export function replacedBy(
  replaced: Soundbite,
  choice: string | null
): ReplacedBy {
  if (replaced.id === choice) return "picked"
  return replaced.standing ?? "current"
}
