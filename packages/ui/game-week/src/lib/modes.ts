/**
 * The three modes (GW25): fixed bundles, lightest first, each a whole answer
 * to how much the screen offers during a game. The owner picks a mode, never
 * a row of one, the pattern of some-censor's modes
 * (`extensions/some-censor/src/lib/settings/modes.ts`). A bite stops itself at
 * one minute in every mode (`BITE_LIMITS`); only the quiet that stops it
 * sooner differs.
 */
import { SOUNDBITE_TAKE_LIMITS } from "@some-ui/soundbites/contract"

export const MODES = ["light", "standard", "full"] as const
export type ModeId = (typeof MODES)[number]

/** When pregame scenarios start being offered, relative to kickoff. */
type PregameFrom =
  | { readonly kind: "before"; readonly ms: number }
  /** From this hour, on the phone's clock, on the day of the game. */
  | { readonly kind: "game-day"; readonly hour: number }

export type ModeRules = {
  /** The most offered cards on screen at once. */
  readonly cards: number
  /** How many "Just happened" are shown, and for how long each stays. */
  readonly justHappened: { readonly count: number; readonly keepMs: number }
  readonly pregame: PregameFrom
  /** How long a quiet stretch, after talking, stops the bite. */
  readonly quietMs: number
}

const HOUR = 3_600_000

export const MODE_RULES: Readonly<Record<ModeId, ModeRules>> = {
  light: {
    cards: 2,
    justHappened: { count: 1, keepMs: 60_000 },
    pregame: { kind: "before", ms: HOUR },
    quietMs: 2_000,
  },
  standard: {
    cards: 4,
    justHappened: { count: 2, keepMs: 90_000 },
    pregame: { kind: "before", ms: 3 * HOUR },
    quietMs: 2_000,
  },
  full: {
    cards: 6,
    justHappened: { count: 3, keepMs: 180_000 },
    pregame: { kind: "game-day", hour: 8 },
    quietMs: 3_000,
  },
}

/** The recommended mode, and the one a phone starts in. */
export const DEFAULT_MODE: ModeId = "standard"

export function isModeId(value: unknown): value is ModeId {
  return MODES.some((mode) => mode === value)
}

/**
 * A bite's bounds: the soundbites' (32 kbps, one minute), so a stray
 * double-tap under a second is no bite.
 */
export const BITE_LIMITS = SOUNDBITE_TAKE_LIMITS

/** When pregame scenarios are first offered for a game kicking off at `kickoff`. */
export function pregameFrom(kickoff: number, rules: ModeRules): number {
  const { pregame } = rules
  if (pregame.kind === "before") return kickoff - pregame.ms
  const day = new Date(kickoff)
  day.setHours(pregame.hour, 0, 0, 0)
  return Math.min(day.getTime(), kickoff)
}
